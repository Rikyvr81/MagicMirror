/* ==========================================================
   MMM-Energia - node_helper

   Questo file NON gira nel browser: gira in Node, sul server di
   Render. Serve due sorgenti, per due ragioni diverse.

   1. PREZZI (api.energy-charts.info)
   Il servizio risponde con un'intestazione
   Access-Control-Allow-Origin fissa sul proprio dominio, quindi
   rifiuta le chiamate fatte da qualsiasi pagina web che non sia
   la sua. Il CORS pero' e' una regola che i BROWSER si impongono
   da soli: una richiesta fatta da Node non la incontra nemmeno.

   2. SHELLY (cloud)
   Qui il motivo e' la chiave. La chiave di autorizzazione Shelly
   permette anche di COMANDARE i dispositivi, non solo di
   leggerli: scritta nel config finirebbe in chiaro nella pagina
   scaricata dal browser e nel repository su GitHub. Restando
   qui, non lascia mai il server.
   La chiave si legge da process.env, quindi va scritta su Render
   in Environment come SHELLY_AUTH_KEY. Nota che questa strada
   funziona SOLO da qui: e' lo stesso motivo per cui il tentativo
   di mettere le credenziali in un file separato letto dal
   config.js era fallito.

   Nessuna delle due risposte viene interpretata qui: i calcoli
   di data, fascia e potenza stanno nel modulo, che gira sulla TV
   e conosce il fuso orario giusto. Il server di Render lavora in
   tempo universale, e fare li' i conti sulle ore significherebbe
   ritrovarsi la giornata sfalsata di due ore d'estate.
   ========================================================== */

const NodeHelper = require("node_helper");

/* Gli indirizzi arrivano dal modulo, cioe' da codice che gira
   nel browser: per principio non ci fidiamo e accettiamo solo
   questi domini. Senza il controllo il node helper diventerebbe
   un proxy aperto, utilizzabile per far scaricare al server
   qualunque cosa. */
const DOMINI_AMMESSI = [
	"api.energy-charts.info",
	".shelly.cloud"
];

/* Quanto testo della risposta d'errore riportare. Basta poco: il
   messaggio utile sta sempre all'inizio, e il riquadro sulla TV
   e' largo poco piu' di 200px. */
const LUNGHEZZA_ERRORE = 180;

const dominioAmmesso = (host) =>
	DOMINI_AMMESSI.some((d) => (d.startsWith(".") ? host.endsWith(d) : host === d));

module.exports = NodeHelper.create({
	start: function () {
		console.log("MMM-Energia: helper avviato");
	},

	socketNotificationReceived: function (avviso, carico) {
		if (avviso === "ENERGIA_SCARICA") this.scaricaPrezzi(carico);
		if (avviso === "SHELLY_SCARICA") this.scaricaShelly(carico);
	},

	/* Un solo tentativo su un solo indirizzo. Restituisce i dati
	   oppure solleva un errore col motivo per esteso. */
	provaIndirizzo: async function (indirizzo) {
		const analizzato = new URL(indirizzo);
		if (!dominioAmmesso(analizzato.hostname)) {
			throw new Error(`dominio non ammesso: ${analizzato.hostname}`);
		}

		/* fetch e' disponibile senza import da Node 18 in poi.
		   MagicMirror richiede gia' una versione superiore, quindi
		   non serve una libreria aggiuntiva. */
		const risposta = await fetch(indirizzo, {
			headers: { Accept: "application/json" }
		});

		/* Il testo si legge PRIMA di guardare lo stato: se la
		   risposta e' un errore, e' li' dentro che il servizio
		   spiega cosa non va. */
		const testo = await risposta.text();

		if (!risposta.ok) {
			throw new Error(`${risposta.status} ${testo.trim().slice(0, LUNGHEZZA_ERRORE)}`);
		}

		return JSON.parse(testo);
	},

	/* ------------------------------------------------------
	   PREZZI
	   Il modulo manda due indirizzi: quello preciso, con le date,
	   e una riserva senza date che il servizio interpreta come
	   "oggi". Se il primo viene rifiutato si prova il secondo
	   prima di dichiarare fallimento: il formato delle date e' la
	   parte piu' fragile della chiamata.
	   ------------------------------------------------------ */
	scaricaPrezzi: async function (carico) {
		const principale = (carico && carico.url) || "";
		const riserva = (carico && carico.riserva) || null;

		try {
			this.sendSocketNotification("ENERGIA_DATI", await this.provaIndirizzo(principale));
			return;
		} catch (primoErrore) {
			console.error("MMM-Energia: prezzi, primo tentativo fallito -", primoErrore.message);

			if (!riserva) {
				this.sendSocketNotification("ENERGIA_ERRORE", { messaggio: primoErrore.message });
				return;
			}

			try {
				const dati = await this.provaIndirizzo(riserva);
				console.log("MMM-Energia: la riserva ha funzionato, le date erano il problema");
				this.sendSocketNotification("ENERGIA_DATI", dati);
			} catch (secondoErrore) {
				console.error("MMM-Energia: prezzi, fallita anche la riserva -", secondoErrore.message);
				this.sendSocketNotification("ENERGIA_ERRORE", {
					messaggio: `${primoErrore.message} / riserva: ${secondoErrore.message}`
				});
			}
		}
	},

	/* ------------------------------------------------------
	   SHELLY
	   Il modulo manda solo server e identificativo: la chiave la
	   mette qui il server, leggendola dall'ambiente. In questo
	   modo il modulo puo' anche essere letto da chiunque apra la
	   pagina senza che la chiave sia deducibile.
	   ------------------------------------------------------ */
	scaricaShelly: async function (carico) {
		const chiave = process.env.SHELLY_AUTH_KEY;

		if (!chiave) {
			const avviso = "SHELLY_AUTH_KEY non impostata su Render";
			console.error("MMM-Energia:", avviso);
			this.sendSocketNotification("SHELLY_ERRORE", { messaggio: avviso });
			return;
		}

		const server = String((carico && carico.server) || "").replace(/\/+$/, "");
		const id = (carico && carico.id) || "";

		if (!server || !id) {
			this.sendSocketNotification("SHELLY_ERRORE", { messaggio: "server o id mancanti nel config" });
			return;
		}

		const indirizzo =
			`${server}/device/status?id=${encodeURIComponent(id)}&auth_key=${encodeURIComponent(chiave)}`;

		try {
			const dati = await this.provaIndirizzo(indirizzo);
			this.sendSocketNotification("SHELLY_DATI", dati);
		} catch (errore) {
			/* L'indirizzo NON finisce nei log: conterrebbe la
			   chiave, e i log di Render sono leggibili da chiunque
			   abbia accesso al pannello. */
			console.error("MMM-Energia: shelly -", errore.message);
			this.sendSocketNotification("SHELLY_ERRORE", { messaggio: errore.message });
		}
	}
});
