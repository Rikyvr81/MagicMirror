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

/* ==========================================================
   MEMORIA CONDIVISA

   Il node_helper e' uno solo, ma i browser collegati possono
   essere molti: la TV, una scheda aperta sul portatile, altre
   dimenticate. Ogni pagina esegue il modulo per conto proprio e
   chiede i dati appena si carica, quindi al riavvio del servizio
   si riconnettono tutte insieme e partono richieste identiche
   nello stesso istante. Il cloud Shelly ammette una richiesta al
   secondo e risponde 429 a tutte le altre.

   Qui l'ultima risposta valida viene tenuta da parte e servita a
   chiunque la chieda: si va davvero sul cloud solo quando e'
   passato abbastanza tempo. Le pagine collegate diventano cosi'
   indifferenti al numero: una o dieci, il traffico verso
   l'esterno e' lo stesso.

   In piu' le richieste contemporanee si accodano alla stessa
   chiamata invece di moltiplicarla: senza questo, quattro pagine
   che partono insieme troverebbero tutte la memoria vuota e
   partirebbero comunque in quattro.
   ========================================================== */

/* Quanto resta buona una lettura Shelly prima di richiederla.
   Il cloud aggiorna lo stato ogni mezzo minuto circa, quindi
   sotto i 25 secondi si otterrebbe lo stesso numero. */
const VALIDITA_SHELLY = 25 * 1000;

/* I prezzi del giorno non cambiano piu' una volta pubblicati:
   qui la memoria serve solo a evitare la raffica al riavvio. */
const VALIDITA_PREZZI = 10 * 60 * 1000;

const dominioAmmesso = (host) =>
	DOMINI_AMMESSI.some((d) => (d.startsWith(".") ? host.endsWith(d) : host === d));

module.exports = NodeHelper.create({
	start: function () {
		console.log("MMM-Energia: helper avviato");
		/* { dati, quando } dell'ultima risposta buona */
		this.memoria = {};
		/* chiamate attualmente in volo, per non duplicarle */
		this.inVolo = {};
	},

	/* ------------------------------------------------------
	   Restituisce i dati dalla memoria se sono ancora freschi,
	   altrimenti scarica. Se un'altra pagina ha gia' avviato la
	   stessa chiamata, ci si accoda a quella invece di farne
	   una seconda.
	   ------------------------------------------------------ */
	conMemoria: async function (chiave, validita, scarica) {
		const salvato = this.memoria[chiave];
		if (salvato && Date.now() - salvato.quando < validita) {
			return salvato.dati;
		}

		if (this.inVolo[chiave]) return this.inVolo[chiave];

		const promessa = (async () => {
			try {
				const dati = await scarica();
				this.memoria[chiave] = { dati: dati, quando: Date.now() };
				return dati;
			} finally {
				delete this.inVolo[chiave];
			}
		})();

		/* PERCHE' QUESTO catch VUOTO NON E' UNA SVISTA
		   Da Node 15 un rifiuto di promessa che nessuno raccoglie
		   NON e' piu' un avviso: abbatte l'intero processo. E qui
		   la promessa vive in due posti - viene restituita al
		   chiamante e messa da parte in inVolo - quindi basta uno
		   scenario in cui il chiamante non arriva ad attenderla
		   perche' il rifiuto resti orfano e porti giu' il server,
		   con tutti gli altri moduli.
		   Il catch qui sotto dichiara che il rifiuto e' previsto.
		   Non lo nasconde: chi attende la promessa lo riceve
		   ugualmente e lo gestisce. */
		promessa.catch(() => {});

		this.inVolo[chiave] = promessa;
		return promessa;
	},

	/* L'ultima risposta buona, anche se scaduta: serve a non
	   svuotare il riquadro quando il cloud rifiuta una chiamata. */
	ultimaBuona: function (chiave) {
		return this.memoria[chiave] ? this.memoria[chiave].dati : null;
	},

	socketNotificationReceived: function (avviso, carico) {
		/* Le due funzioni sono asincrone e vengono lanciate senza
		   attenderle: qualunque eccezione sfuggita ai loro try
		   interni diventerebbe un rifiuto orfano, e quindi la
		   morte del processo. Il catch qui e' l'ultima rete. */
		if (avviso === "ENERGIA_SCARICA") {
			this.scaricaPrezzi(carico).catch((e) =>
				console.error("MMM-Energia: prezzi, errore non gestito -", e && e.message)
			);
		}

		if (avviso === "SHELLY_SCARICA") {
			this.scaricaShelly(carico).catch((e) =>
				console.error("MMM-Energia: shelly, errore non gestito -", e && e.message)
			);
		}
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
			const dati = await this.conMemoria(
				"prezzi", VALIDITA_PREZZI, () => this.provaIndirizzo(principale)
			);
			this.sendSocketNotification("ENERGIA_DATI", dati);
			return;
		} catch (primoErrore) {
			console.error("MMM-Energia: prezzi, primo tentativo fallito -", primoErrore.message);

			if (!riserva) {
				this.sendSocketNotification("ENERGIA_ERRORE", { messaggio: primoErrore.message });
				return;
			}

			try {
				const dati = await this.conMemoria(
					"prezzi", VALIDITA_PREZZI, () => this.provaIndirizzo(riserva)
				);
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
			const dati = await this.conMemoria(
				"shelly", VALIDITA_SHELLY, () => this.provaIndirizzo(indirizzo)
			);

			/* DIAGNOSTICA
			   Stampa la forma della risposta, non il contenuto
			   completo e mai l'indirizzo (che conterrebbe la
			   chiave). Serve a capire dove il cloud metta lo stato
			   di connessione, che nelle risposte reali non e'
			   sempre dove la documentazione lascia intendere.
			   Quando il modulo sara' assestato, questo blocco si
			   puo' togliere. */
			const d = dati && dati.data;
			const s = d && d.device_status;
			console.log(
				"MMM-Energia: shelly ->",
				"campi in data:", d ? Object.keys(d).join(",") : "nessuno",
				"| online:", d ? JSON.stringify(d.online) : "assente",
				"| _updated:", s ? JSON.stringify(s._updated) : "assente",
				"| cloud:", s && s.cloud ? JSON.stringify(s.cloud) : "assente"
			);

			this.sendSocketNotification("SHELLY_DATI", dati);
		} catch (errore) {
			/* L'indirizzo NON finisce nei log: conterrebbe la
			   chiave, e i log di Render sono leggibili da chiunque
			   abbia accesso al pannello. */
			console.error("MMM-Energia: shelly -", errore.message);

			/* Se il cloud rifiuta la chiamata ma abbiamo una
			   lettura precedente, si manda quella: il modulo sa
			   gia' calcolarne l'eta' e, se e' troppo vecchia, lo
			   scrive da solo sotto il numero. Meglio un dato
			   datato e dichiarato che un riquadro vuoto. */
			const ripiego = this.ultimaBuona("shelly");
			if (ripiego) {
				this.sendSocketNotification("SHELLY_DATI", ripiego);
				return;
			}

			this.sendSocketNotification("SHELLY_ERRORE", { messaggio: errore.message });
		}
	}
});