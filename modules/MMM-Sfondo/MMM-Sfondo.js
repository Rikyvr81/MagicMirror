/* ==========================================================
   MMM-Sfondo
   Fotografia di sfondo a rotazione.

   Sostituisce il blocco "SFONDO A ROTAZIONE" che stava in cima
   al config.js. Il motivo del trasloco e' la chiave di Unsplash:
   il config viene eseguito dal browser, e una chiave scritta li'
   sarebbe leggibile da chiunque apra la pagina. Qui invece la
   scelta della foto avviene sul server, in node_helper.js, e al
   browser arriva solo l'indirizzo dell'immagine.

   COSA FA QUESTO FILE
   Chiede una foto, la applica come sfondo e - se richiesto -
   mostra il credito all'autore. Non conosce chiavi e non
   potrebbe rifare la chiamata da solo.

   COME VIENE APPLICATA
   Si scrive un background-image in linea su <html>. Non su
   <body>: MagicMirror applica dei margini ai bordi del body, e
   quei margini resterebbero fuori dall'area dipinta lasciando
   una cornice nera.
   Il custom.css poi non dipinge direttamente quell'immagine: la
   fa ereditare a uno pseudo-elemento piu' grande dello schermo,
   per l'ingrandimento che taglia i bordi. Qui non serve saperlo,
   ma spiega perche' l'immagine puo' non comparire se il foglio
   di stile e' vecchio.
   ========================================================== */

Module.register("MMM-Sfondo", {
	defaults: {
		/* DA DOVE ARRIVANO LE FOTOGRAFIE
		     1 = solo Google Drive, le tue
		     2 = entrambe, sorteggiate a ogni cambio
		     3 = solo Unsplash
		   Nel modo 2 non c'e' una principale e una di riserva: si
		   tira a sorte ogni volta, cosi' entrambe restano in uso.
		   Se una fallisce si prova comunque l'altra, quindi uno
		   sfondo c'e' sempre. */
		modo: 2,

		/* Codice della cartella condivisa su Drive: la parte del
		   link dopo /folders/. La cartella deve essere impostata
		   su "chiunque abbia il link", altrimenti il server non
		   puo' leggerla - e per questo li' dentro vanno solo foto
		   che non ti dispiacerebbe far vedere a uno sconosciuto. */
		cartellaDrive: "",

		/* Parole di ricerca, IN INGLESE.
		   Le fotografie su Unsplash sono etichettate quasi tutte in
		   inglese: cercando "paesaggi" si trova solo quel poco che
		   qualche autore italiano ha descritto nella nostra lingua,
		   e la scelta si riduce a pochissime immagini.
		   A ogni cambio se ne sorteggia una: i generi si alternano
		   invece di esaurirsi uno alla volta. */
		ricerche: ["landscape", "fine art photography"],

		/* Ogni quanto cambia la fotografia */
		intervallo: 30 * 60 * 1000,

		/* Dopo un errore si riprova prima, senza aspettare mezz'ora */
		riprova: 5 * 60 * 1000,

		/* Credito all'autore in basso a destra.
		   Non e' un vezzo: le condizioni d'uso dell'API di Unsplash
		   chiedono di accreditare il fotografo. La licenza delle
		   immagini non lo impone, i termini del servizio si.
		   Mettendolo a false il credito sparisce - la scelta e'
		   tua, ma sappi cosa stai togliendo. */
		credito: true
	},

	start: function () {
		this.autore = null;
		this.profilo = null;

		this.chiediFoto();
		setInterval(() => this.chiediFoto(), this.config.intervallo);
	},

	chiediFoto: function () {
		this.sendSocketNotification("SFONDO_CHIEDI", {
			modo: this.config.modo,
			ricerche: this.config.ricerche,
			cartella: this.config.cartellaDrive
		});
	},

	socketNotificationReceived: function (avviso, carico) {
		if (avviso === "SFONDO_FOTO") {
			this.applica(carico);
			return;
		}

		if (avviso === "SFONDO_ERRORE") {
			/* Non si tocca lo sfondo attuale: meglio la foto di
			   mezz'ora fa che uno schermo nero. Si riprova prima
			   del giro normale. */
			console.error("MMM-Sfondo:", carico.messaggio);
			setTimeout(() => this.chiediFoto(), this.config.riprova);
		}
	},

	/* L'immagine si carica PRIMA di metterla a video: applicandola
	   subito si vedrebbe lo sfondo sparire e ricomparire man mano
	   che il file arriva. Cosi' invece il cambio e' istantaneo. */
	applica: function (dati) {
		const pre = new Image();

		pre.onload = () => {
			document.documentElement.style.backgroundImage = `url("${dati.immagine}")`;
			/* Il credito riguarda solo Unsplash: le tue foto non
			   hanno un autore da accreditare, e la riga sparisce da
			   sola quando la fotografia viene dal Drive. */
			this.autore = dati.autore || null;
			this.profilo = dati.profilo || null;
			this.updateDom();
		};

		pre.onerror = () => {
			console.error("MMM-Sfondo: immagine non caricabile");
			setTimeout(() => this.chiediFoto(), this.config.riprova);
		};

		pre.src = dati.immagine;
	},

	getDom: function () {
		const radice = document.createElement("div");
		radice.className = "sfondo-credito";

		if (!this.config.credito || !this.autore) return radice;

		radice.textContent = `foto di ${this.autore} su Unsplash`;
		return radice;
	}
});
