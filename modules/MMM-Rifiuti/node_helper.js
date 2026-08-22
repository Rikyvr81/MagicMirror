/* ==========================================================
   MMM-Rifiuti - node_helper

   Legge il foglio Google col calendario della raccolta
   differenziata. Stessa tecnica di MMM-Budget: l'indirizzo che i
   Fogli espongono da sempre restituisce una scheda in formato
   CSV senza autenticazione, purche' il documento sia condiviso
   "con chiunque abbia il link".

   PERCHE' UN HELPER PROPRIO E NON QUELLO DEL BUDGET
   Il codice per leggere un CSV e' quasi identico, ed e' una
   duplicazione che si vede. La scelta e' voluta: i due moduli
   restano indipendenti, e se domani cambia il foglio del budget
   o si rompe la sua lettura, i rifiuti continuano a funzionare.
   Legare due funzioni diverse allo stesso pezzo di codice fa
   risparmiare venti righe e costa un guasto condiviso.

   Qui non si fa alcun calcolo di date: si legge e si spacchetta.
   Stabilire quale sia "domani" tocca al modulo, che gira sulla
   TV e conosce il fuso orario giusto.
   ========================================================== */

const NodeHelper = require("node_helper");

const FOGLI = "https://docs.google.com/spreadsheets";

/* Un calendario dei rifiuti cambia una volta l'anno: mezz'ora e'
   gia' molto piu' frequente del necessario. */
const VALIDITA = 30 * 60 * 1000;

const LUNGHEZZA_ERRORE = 180;

/* Lettura del CSV carattere per carattere: non basta dividere
   per virgola, perche' i campi sono fra virgolette e possono
   contenerne a loro volta - una nota come "Natale, festivo"
   manderebbe fuori sincrono tutte le colonne successive. */
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

		if (c === '"') dentro = true;
		else if (c === ",") { riga.push(campo); campo = ""; }
		else if (c === "\n") { riga.push(campo); righe.push(riga); riga = []; campo = ""; }
		else if (c !== "\r") campo += c;
	}

	if (campo !== "" || riga.length) {
		riga.push(campo);
		righe.push(riga);
	}

	return righe;
}

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
		console.log("MMM-Rifiuti: helper avviato");
		this.memoria = null;
		this.quando = 0;
	},

	socketNotificationReceived: function (avviso, carico) {
		if (avviso !== "RIFIUTI_CHIEDI") return;

		this.leggi(carico).catch((e) =>
			console.error("MMM-Rifiuti: errore non gestito -", e && e.message)
		);
	},

	leggi: async function (carico) {
		const foglio = carico && carico.foglio;

		if (!foglio) {
			this.sendSocketNotification("RIFIUTI_ERRORE", { messaggio: "foglio non indicato nel config" });
			return;
		}

		if (this.memoria && Date.now() - this.quando < VALIDITA) {
			this.sendSocketNotification("RIFIUTI_DATI", this.memoria);
			return;
		}

		/* Senza il nome della scheda i Fogli restituiscono la prima,
		   che e' il caso normale per un documento a scheda unica. */
		const scheda = (carico.scheda || "").trim();
		const url =
			`${FOGLI}/d/${encodeURIComponent(foglio)}/gviz/tq?tqx=out:csv` +
			(scheda ? `&sheet=${encodeURIComponent(scheda)}` : "");

		try {
			const risposta = await fetch(url);
			const testo = await risposta.text();

			if (!risposta.ok) {
				throw new Error(`${risposta.status} ${testo.trim().slice(0, LUNGHEZZA_ERRORE)}`);
			}

			/* Quando il foglio non e' condiviso, Google non risponde
			   con un errore: manda la pagina di accesso, che comincia
			   con una parentesi angolare. Senza questo controllo il
			   modulo direbbe "nessun dato" invece della causa vera. */
			if (testo.trim().startsWith("<")) {
				throw new Error("il foglio non e' condiviso con chiunque abbia il link");
			}

			const righe = aOggetti(leggiCsv(testo));

			this.memoria = { righe: righe };
			this.quando = Date.now();

			console.log(`MMM-Rifiuti: letto il calendario, ${righe.length} giornate`);
			this.sendSocketNotification("RIFIUTI_DATI", this.memoria);
		} catch (errore) {
			console.error("MMM-Rifiuti:", errore.message);

			if (this.memoria) {
				this.sendSocketNotification("RIFIUTI_DATI", this.memoria);
				return;
			}

			this.sendSocketNotification("RIFIUTI_ERRORE", { messaggio: errore.message });
		}
	}
});
