/* ==========================================================
   MMM-Budget - node_helper

   Legge il foglio Google con budget e spese. Gira in Node, sul
   server, ma per una ragione diversa dagli altri helper: qui non
   c'e' nessuna chiave da proteggere.

   PERCHE' ALLORA NON DAL BROWSER
   Perche' i Fogli non accettano richieste da altre pagine web:
   e' lo stesso CORS che ci ha fermati col servizio dei prezzi.
   Da Node quella regola non esiste.

   COME SI LEGGE UN FOGLIO SENZA CHIAVE
   I Fogli espongono da sempre un indirizzo che restituisce il
   contenuto di una scheda in formato CSV, senza autenticazione,
   purche' il documento sia condiviso "con chiunque abbia il
   link". Verificato in navigazione anonima sul foglio vero.
   E' piu' semplice dell'API ufficiale - niente chiave, niente
   quote - e ha un pezzo in meno che si puo' rompere.

   COSA NON FA
   Nessun calcolo. Qui si legge e si spacchetta il CSV; le date e
   l'aritmetica del budget stanno nel modulo, che gira sulla TV e
   conosce il fuso orario giusto. Il server lavora in tempo
   universale, e stabilire li' quale sia "oggi" darebbe risultati
   sbagliati per due ore ogni notte.
   ========================================================== */

const NodeHelper = require("node_helper");

const FOGLI = "https://docs.google.com/spreadsheets";

/* Il foglio cambia poco: qualche riga al giorno. Rileggerlo piu'
   spesso di cosi' non aggiungerebbe nulla. */
const VALIDITA = 10 * 60 * 1000;

const LUNGHEZZA_ERRORE = 180;

/* ----------------------------------------------------------
   LETTURA DEL CSV

   Non basta dividere per virgola: i campi sono fra virgolette e
   possono contenere virgole a loro volta - una descrizione come
   "spesa, farmacia" manderebbe fuori sincrono tutte le colonne
   successive. Si scorre quindi carattere per carattere tenendo
   conto di quando si e' dentro o fuori dalle virgolette.
   Le virgolette raddoppiate ("") sono il modo del formato per
   dire "una virgoletta vera".
   ---------------------------------------------------------- */
function leggiCsv(testo) {
	const righe = [];
	let riga = [];
	let campo = "";
	let dentro = false;

	for (let i = 0; i < testo.length; i++) {
		const c = testo[i];

		if (dentro) {
			if (c === '"') {
				if (testo[i + 1] === '"') {
					campo += '"';
					i++;
				} else {
					dentro = false;
				}
			} else {
				campo += c;
			}
			continue;
		}

		if (c === '"') {
			dentro = true;
		} else if (c === ",") {
			riga.push(campo);
			campo = "";
		} else if (c === "\n") {
			riga.push(campo);
			righe.push(riga);
			riga = [];
			campo = "";
		} else if (c !== "\r") {
			campo += c;
		}
	}

	/* l'ultima riga puo' non avere un a capo in fondo */
	if (campo !== "" || riga.length) {
		riga.push(campo);
		righe.push(riga);
	}

	return righe;
}

/* Dalla griglia di celle a un elenco di oggetti, usando la prima
   riga come intestazione. Le chiavi si normalizzano in minuscolo
   senza spazi, cosi' "Informazioni cronologiche" diventa
   "informazionicronologiche" e piccole differenze di scrittura
   nel foglio non rompono la lettura. */
function aOggetti(righe) {
	if (!righe.length) return [];

	const chiavi = righe[0].map((c) => c.trim().toLowerCase().replace(/\s+/g, ""));

	return righe.slice(1)
		.filter((r) => r.some((c) => c.trim() !== ""))
		.map((r) => {
			const o = {};
			chiavi.forEach((k, i) => { o[k] = (r[i] || "").trim(); });
			return o;
		});
}

module.exports = NodeHelper.create({
	start: function () {
		console.log("MMM-Budget: helper avviato");
		this.memoria = null;
		this.quando = 0;
	},

	socketNotificationReceived: function (avviso, carico) {
		if (avviso !== "BUDGET_CHIEDI") return;

		this.leggi(carico).catch((e) =>
			console.error("MMM-Budget: errore non gestito -", e && e.message)
		);
	},

	scheda: async function (foglio, nome) {
		const url =
			`${FOGLI}/d/${encodeURIComponent(foglio)}/gviz/tq` +
			`?tqx=out:csv&sheet=${encodeURIComponent(nome)}`;

		const risposta = await fetch(url);
		const testo = await risposta.text();

		if (!risposta.ok) {
			throw new Error(`scheda ${nome}: ${risposta.status} ${testo.trim().slice(0, LUNGHEZZA_ERRORE)}`);
		}

		/* Quando il foglio non e' condiviso, Google non risponde con
		   un errore: manda la pagina di accesso, che comincia con
		   una parentesi angolare. Senza questo controllo il CSV
		   risulterebbe vuoto e il modulo direbbe "nessun dato"
		   invece della causa vera. */
		if (testo.trim().startsWith("<")) {
			throw new Error(`scheda ${nome}: il foglio non e' condiviso con chiunque abbia il link`);
		}

		return aOggetti(leggiCsv(testo));
	},

	leggi: async function (carico) {
		const foglio = carico && carico.foglio;

		if (!foglio) {
			this.sendSocketNotification("BUDGET_ERRORE", { messaggio: "foglio non indicato nel config" });
			return;
		}

		if (this.memoria && Date.now() - this.quando < VALIDITA) {
			this.sendSocketNotification("BUDGET_DATI", this.memoria);
			return;
		}

		try {
			const [budget, spese] = await Promise.all([
				this.scheda(foglio, carico.schedaBudget || "Budget"),
				this.scheda(foglio, carico.schedaSpese || "Spese")
			]);

			this.memoria = { budget: budget, spese: spese };
			this.quando = Date.now();

			console.log(`MMM-Budget: letto il foglio, ${budget.length} mesi e ${spese.length} spese`);
			this.sendSocketNotification("BUDGET_DATI", this.memoria);
		} catch (errore) {
			console.error("MMM-Budget:", errore.message);

			/* Se avevamo gia' letto, si rimanda l'ultima lettura
			   buona: meglio numeri di dieci minuti fa che un buco. */
			if (this.memoria) {
				this.sendSocketNotification("BUDGET_DATI", this.memoria);
				return;
			}

			this.sendSocketNotification("BUDGET_ERRORE", { messaggio: errore.message });
		}
	}
});
