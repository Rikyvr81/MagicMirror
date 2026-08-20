/* ==========================================================
   MMM-Energia - node_helper

   Questo file NON gira nel browser: gira in Node, sul server di
   Render. E' l'unica ragione per cui esiste.

   Il servizio dei prezzi (api.energy-charts.info) risponde con
   un'intestazione Access-Control-Allow-Origin fissa sul proprio
   dominio, quindi rifiuta le chiamate fatte da qualsiasi pagina
   web che non sia la sua. Il CORS pero' e' una regola che i
   BROWSER si impongono da soli: una richiesta fatta da Node non
   la incontra nemmeno.

   Il compito qui e' minimo e volutamente stupido: ricevere un
   indirizzo dal modulo, scaricarlo, restituire il JSON com'e'.
   Nessun calcolo di date o di fasce: quelli stanno nel modulo,
   che gira sulla TV e conosce il fuso orario giusto. Il server
   di Render lavora in tempo universale, e fare li' i conti sulle
   ore significherebbe ritrovarsi la giornata sfalsata di due ore
   d'estate.

   DUE INDIRIZZI INVECE DI UNO
   Il modulo ne manda due: quello preciso, con le date, e una
   riserva senza date, che il servizio interpreta come "oggi".
   Se il primo viene rifiutato si prova il secondo prima di
   dichiarare fallimento. Serve perche' il formato delle date e'
   la parte piu' fragile della chiamata, mentre la sola zona e'
   sempre stata accettata.

   IL CORPO DELL'ERRORE VIENE RIPORTATO
   La versione precedente si fermava al numero di stato ("400") e
   buttava via il testo della risposta, che e' proprio dove il
   servizio scrive quale parametro non gli e' piaciuto. Ora quel
   testo arriva fino al riquadro sulla TV.
   ========================================================== */

const NodeHelper = require("node_helper");

/* Il modulo manda l'indirizzo gia' composto, e il modulo e'
   codice che arriva dal browser: per principio non ci fidiamo e
   accettiamo un solo dominio. Senza questo controllo il node
   helper diventerebbe un proxy aperto, utilizzabile per far
   scaricare al server qualunque cosa. */
const DOMINIO_AMMESSO = "api.energy-charts.info";

/* Quanto testo della risposta d'errore riportare. Basta poco:
   il messaggio utile sta sempre all'inizio, e il riquadro sulla
   TV e' largo 440px. */
const LUNGHEZZA_ERRORE = 180;

module.exports = NodeHelper.create({
	start: function () {
		console.log("MMM-Energia: helper avviato");
	},

	socketNotificationReceived: function (avviso, carico) {
		if (avviso !== "ENERGIA_SCARICA") return;
		this.scarica(carico);
	},

	/* Un solo tentativo su un solo indirizzo. Restituisce i dati
	   oppure solleva un errore col motivo per esteso. */
	provaIndirizzo: async function (indirizzo) {
		const analizzato = new URL(indirizzo);
		if (analizzato.hostname !== DOMINIO_AMMESSO) {
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
			const dettaglio = testo.trim().slice(0, LUNGHEZZA_ERRORE);
			throw new Error(`${risposta.status} ${dettaglio}`);
		}

		return JSON.parse(testo);
	},

	scarica: async function (carico) {
		const principale = (carico && carico.url) || "";
		const riserva = (carico && carico.riserva) || null;

		/* i log di Render sono l'unico posto dove si vede
		   l'indirizzo esatto che e' partito */
		console.log("MMM-Energia: richiesta", principale);

		try {
			const dati = await this.provaIndirizzo(principale);
			this.sendSocketNotification("ENERGIA_DATI", dati);
			return;
		} catch (primoErrore) {
			console.error("MMM-Energia: fallito il primo tentativo -", primoErrore.message);

			if (!riserva) {
				this.sendSocketNotification("ENERGIA_ERRORE", { messaggio: primoErrore.message });
				return;
			}

			/* Seconda possibilita': indirizzo senza date */
			console.log("MMM-Energia: riprovo con", riserva);

			try {
				const dati = await this.provaIndirizzo(riserva);
				console.log("MMM-Energia: la riserva ha funzionato, le date erano il problema");
				this.sendSocketNotification("ENERGIA_DATI", dati);
			} catch (secondoErrore) {
				console.error("MMM-Energia: fallita anche la riserva -", secondoErrore.message);
				this.sendSocketNotification("ENERGIA_ERRORE", {
					messaggio: `${primoErrore.message} / riserva: ${secondoErrore.message}`
				});
			}
		}
	}
});
