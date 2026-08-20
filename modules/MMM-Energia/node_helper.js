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

   Il compito qui e' quindi minimo e volutamente stupido:
   ricevere un indirizzo dal modulo, scaricarlo, restituire il
   JSON com'e'. Nessun calcolo di date o di fasce: quelli stanno
   nel modulo, che gira sulla TV e conosce il fuso orario giusto.
   Il server di Render lavora in tempo universale, e fare li' i
   conti sulle ore significherebbe ritrovarsi la giornata
   sfalsata di due ore d'estate.
   ========================================================== */

const NodeHelper = require("node_helper");

/* Il modulo manda l'indirizzo gia' composto, e il modulo e'
   codice che arriva dal browser: per principio non ci fidiamo e
   accettiamo un solo dominio. Senza questo controllo il node
   helper diventerebbe un proxy aperto, utilizzabile per far
   scaricare al server qualunque cosa. */
const DOMINIO_AMMESSO = "api.energy-charts.info";

module.exports = NodeHelper.create({
	start: function () {
		console.log("MMM-Energia: helper avviato");
	},

	socketNotificationReceived: function (avviso, carico) {
		if (avviso !== "ENERGIA_SCARICA") return;
		this.scarica(carico);
	},

	scarica: async function (carico) {
		const indirizzo = (carico && carico.url) || "";

		try {
			const analizzato = new URL(indirizzo);
			if (analizzato.hostname !== DOMINIO_AMMESSO) {
				throw new Error(`dominio non ammesso: ${analizzato.hostname}`);
			}

			/* fetch e' disponibile senza import da Node 18 in poi.
			   MagicMirror richiede gia' una versione superiore,
			   quindi non serve una libreria aggiuntiva. */
			const risposta = await fetch(indirizzo, {
				headers: { Accept: "application/json" }
			});

			if (!risposta.ok) {
				throw new Error(`il servizio ha risposto ${risposta.status}`);
			}

			const dati = await risposta.json();
			this.sendSocketNotification("ENERGIA_DATI", dati);
		} catch (errore) {
			/* Il messaggio arriva fino al riquadro sulla TV: e'
			   voluto. Un "Prezzi non disponibili" muto costringe ad
			   aprire la console per capire cosa sia successo. */
			console.error("MMM-Energia:", errore.message);
			this.sendSocketNotification("ENERGIA_ERRORE", { messaggio: errore.message });
		}
	}
});
