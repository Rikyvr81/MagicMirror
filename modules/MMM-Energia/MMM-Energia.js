/* ==========================================================
   MMM-Energia
   Costo dell'energia nell'arco della giornata.

   Mostra, per le 24 ore di oggi, quali sono le ore a costo
   basso, medio e alto, e qual e' la finestra continua piu'
   economica in cui concentrare i consumi.

   COME SI DIVIDE IL LAVORO
   - questo file gira nel BROWSER (sulla TV): conosce il fuso
     orario locale, quindi decide quale giornata chiedere,
     raggruppa i valori per ora e calcola le fasce;
   - node_helper.js gira sul SERVER: si limita a scaricare, e
     serve solo perche' il servizio dei prezzi rifiuta le
     chiamate provenienti da una pagina web.

   PERCHE' I DATI DI OGGI SONO GIA' NOTI STAMATTINA
   Il prezzo si forma in un'asta che chiude il giorno prima
   verso le 13:00: alle 13 di ieri erano gia' fissate tutte le
   24 ore di oggi. Non e' un dato storico, ma il prezzo
   effettivo delle ore che devono ancora arrivare. Dalle 13:00
   di oggi ci sono anche quelle di domani: basta portare
   l'opzione "giorno" a 1.

   ATTENZIONE AL SIGNIFICATO DEL NUMERO
   La zona IT-NORTH e' il prezzo ZONALE del nord Italia, che non
   coincide col PUN nazionale mostrato dall'app del fornitore:
   sono vicini ma non identici, quindi la media in euro puo'
   scostarsi di qualche millesimo. La suddivisione in fasce, che
   e' la parte utile, resta corretta.
   E' comunque il prezzo all'INGROSSO: la bolletta ci aggiunge
   spread, oneri, trasporto e IVA. Dice QUANDO conviene
   consumare, non quanto si paghera'.
   ========================================================== */

Module.register("MMM-Energia", {
	defaults: {
		/* Zona di offerta. Villafranca di Verona sta nel nord. */
		zona: "IT-NORTH",

		/* 0 = oggi, 1 = domani (disponibile solo dopo le 13:00) */
		giorno: 0,

		/* Durata in ore della "fascia migliore" cercata. A 3 e' la
		   stessa finestra che usa l'app del fornitore; alzala a 4 o
		   5 per un intervallo in cui far partire piu' macchine. */
		finestra: 3,

		/* I prezzi del giorno non cambiano piu' una volta
		   pubblicati: un giro all'ora serve solo a intercettare il
		   cambio di giornata. */
		aggiornamento: 60 * 60 * 1000,

		/* Dopo un errore si riprova prima, senza aspettare l'ora */
		riprova: 5 * 60 * 1000,

		titolo: "COSTO ENERGIA OGGI"
	},

	start: function () {
		this.prezzi = null;      // 24 valori in euro/kWh, oppure null
		this.errore = null;      // messaggio dell'ultimo tentativo fallito

		this.chiediPrezzi();
		setInterval(() => this.chiediPrezzi(), this.config.aggiornamento);

		/* Il giro al minuto NON scarica nulla: serve a spostare il
		   segnalino dell'ora corrente e, a mezzanotte, a far
		   ripartire la richiesta per la nuova giornata. */
		setInterval(() => {
			if (new Date().getHours() === 0 && new Date().getMinutes() === 0) {
				this.chiediPrezzi();
			}
			this.updateDom();
		}, 60 * 1000);
	},

	/* ------------------------------------------------------
	   RICHIESTA
	   L'indirizzo si compone QUI, non nell'helper: le date sono
	   quelle locali della TV, e il server lavora in tempo
	   universale.
	   ------------------------------------------------------ */
	chiediPrezzi: function () {
		const base = new Date();
		const giorno = new Date(base.getFullYear(), base.getMonth(), base.getDate() + this.config.giorno);
		const giornoDopo = new Date(giorno.getFullYear(), giorno.getMonth(), giorno.getDate() + 1);

		this.giornoRichiesto = this.dataLocale(giorno);

		const url =
			`https://api.energy-charts.info/price?bzn=${encodeURIComponent(this.config.zona)}` +
			`&start=${this.dataLocale(giorno)}&end=${this.dataLocale(giornoDopo)}`;

		/* Indirizzo di riserva, senza date: il servizio lo
		   interpreta come "oggi". Ha senso solo se e' oggi che
		   stiamo chiedendo, altrimenti otterremmo la giornata
		   sbagliata senza accorgercene. */
		const riserva =
			this.config.giorno === 0
				? `https://api.energy-charts.info/price?bzn=${encodeURIComponent(this.config.zona)}`
				: null;

		this.sendSocketNotification("ENERGIA_SCARICA", { url: url, riserva: riserva });
	},

	socketNotificationReceived: function (avviso, carico) {
		if (avviso === "ENERGIA_DATI") {
			try {
				this.prezzi = this.riduciAOre(carico);
				this.errore = null;
			} catch (e) {
				this.errore = e.message;
			}
			this.updateDom();
			return;
		}

		if (avviso === "ENERGIA_ERRORE") {
			this.errore = carico.messaggio;
			/* si tiene l'ultimo dato buono, se c'era: meglio un
			   prezzo di un'ora fa che un riquadro vuoto */
			setTimeout(() => this.chiediPrezzi(), this.config.riprova);
			this.updateDom();
		}
	},

	/* ------------------------------------------------------
	   DA RISPOSTA GREZZA A 24 MEDIE ORARIE
	   Il servizio puo' rispondere a passo orario o di quindici
	   minuti, a seconda della zona e del periodo. Invece di dare
	   per scontato il passo, raggruppiamo per ora locale e
	   facciamo la media: funziona in entrambi i casi e non si
	   rompe se il mercato cambia granularita'.
	   ------------------------------------------------------ */
	riduciAOre: function (dati) {
		/* il campo dei valori ha cambiato nome nel tempo: li
		   accettiamo entrambi invece di inseguire la versione */
		const valori = (dati && (dati.price || dati.data)) || [];
		const istanti = (dati && dati.unix_seconds) || [];
		if (!istanti.length) throw new Error("risposta senza dati");

		const somma = new Array(24).fill(0);
		const conta = new Array(24).fill(0);

		istanti.forEach((secondi, i) => {
			const valore = valori[i];
			if (valore === null || valore === undefined) return;

			const istante = new Date(secondi * 1000);
			/* la risposta puo' contenere code del giorno prima o
			   dopo: teniamo solo la giornata richiesta */
			if (this.dataLocale(istante) !== this.giornoRichiesto) return;

			somma[istante.getHours()] += valore;
			conta[istante.getHours()]++;
		});

		/* da EUR/MWh a euro al kWh: diviso mille */
		const ore = somma.map((s, h) => (conta[h] ? s / conta[h] / 1000 : null));

		if (ore.every((v) => v === null)) throw new Error("giornata non ancora pubblicata");
		return ore;
	},

	/* ------------------------------------------------------
	   FASCE
	   Le tre fasce non hanno soglie fisse in euro: sarebbero
	   inutili, perche' una giornata cara avrebbe tutte le ore
	   sopra soglia e si colorerebbe di rosso per intero.
	   Dividiamo invece le 24 ore in tre gruppi da otto: le otto
	   piu' economiche, le otto intermedie, le otto piu' care.
	   I gruppi non sono sempre esattamente da otto: quando piu'
	   ore hanno lo stesso prezzo finiscono per forza dalla stessa
	   parte della soglia, e i conteggi si sbilanciano un po'.
	   La lettura resta relativa alla giornata, che e' quello che
	   serve per decidere quando accendere la lavastoviglie.
	   ------------------------------------------------------ */
	calcolaFasce: function (ore) {
		const validi = ore.filter((v) => v !== null).slice().sort((a, b) => a - b);
		if (!validi.length) return ore.map(() => null);

		const sogliaBassa = validi[Math.floor(validi.length / 3)];
		const sogliaAlta = validi[Math.floor((validi.length * 2) / 3)];

		return ore.map((v) => {
			if (v === null) return null;
			if (v <= sogliaBassa) return "bassa";
			if (v <= sogliaAlta) return "media";
			return "alta";
		});
	},

	/* Finestra continua con la media piu' bassa. Si scorre tutta
	   la giornata, comprese le ore gia' passate: se il momento
	   migliore era stamattina e' bene saperlo, invece di vedersi
	   proporre il meno peggio di quel che resta. */
	miglioreFinestra: function (ore) {
		const larghezza = this.config.finestra;
		let migliore = null;

		for (let h = 0; h + larghezza <= 24; h++) {
			const fetta = ore.slice(h, h + larghezza);
			if (fetta.some((v) => v === null)) continue;

			const media = fetta.reduce((a, b) => a + b, 0) / larghezza;
			if (!migliore || media < migliore.media) migliore = { ora: h, media: media };
		}

		return migliore;
	},

	/* ------------------------------------------------------
	   AIUTI DI FORMATO
	   ------------------------------------------------------ */

	/* Data AAAA-MM-GG costruita sui campi LOCALI. toISOString()
	   non va bene: converte in tempo universale e d'estate, dopo
	   le 22:00, restituirebbe il giorno dopo. */
	dataLocale: function (d) {
		const mm = String(d.getMonth() + 1).padStart(2, "0");
		const gg = String(d.getDate()).padStart(2, "0");
		return `${d.getFullYear()}-${mm}-${gg}`;
	},

	oraDue: function (h) {
		return `${String(h).padStart(2, "0")}:00`;
	},

	euro: function (v) {
		return v.toLocaleString("it-IT", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
	},

	/* ------------------------------------------------------
	   DISEGNO
	   ------------------------------------------------------ */
	getDom: function () {
		const radice = document.createElement("div");
		radice.className = "energy-block";

		const intestazione = document.createElement("div");
		intestazione.className = "energy-header";
		intestazione.textContent = this.config.titolo;
		radice.appendChild(intestazione);

		const pannello = document.createElement("div");
		pannello.className = "energy-panel";
		radice.appendChild(pannello);

		if (!this.prezzi) {
			const avviso = document.createElement("div");
			avviso.className = "energy-avviso";
			avviso.textContent = this.errore
				? `Prezzi non disponibili: ${this.errore}`
				: "Caricamento in corso";
			pannello.appendChild(avviso);
			return radice;
		}

		const ore = this.prezzi;
		const fasce = this.calcolaFasce(ore);
		const migliore = this.miglioreFinestra(ore);
		const validi = ore.filter((v) => v !== null);
		const media = validi.reduce((a, b) => a + b, 0) / validi.length;
		const adesso = this.config.giorno === 0 ? new Date().getHours() : -1;

		/* riga della fascia migliore */
		const rigaMigliore = document.createElement("div");
		rigaMigliore.className = "energy-best";

		const ore1 = document.createElement("span");
		ore1.className = "energy-best-hours";
		ore1.textContent = migliore
			? `${this.oraDue(migliore.ora)} – ${this.oraDue(migliore.ora + this.config.finestra)}`
			: "—";
		rigaMigliore.appendChild(ore1);

		if (migliore) {
			const prezzo = document.createElement("span");
			prezzo.className = "energy-best-avg";
			prezzo.textContent = `${this.euro(migliore.media)} €/kWh`;
			rigaMigliore.appendChild(prezzo);
		}
		pannello.appendChild(rigaMigliore);

		/* striscia delle 24 ore */
		const barra = document.createElement("div");
		barra.className = "energy-bar";
		fasce.forEach((f, h) => {
			const segmento = document.createElement("span");
			segmento.className = "energy-seg" + (f ? ` energy-${f}` : "") + (h === adesso ? " energy-adesso" : "");
			barra.appendChild(segmento);
		});
		pannello.appendChild(barra);

		/* scala oraria */
		const scala = document.createElement("div");
		scala.className = "energy-ticks";
		["00", "06", "12", "18", "24"].forEach((t) => {
			const e = document.createElement("span");
			e.textContent = t;
			scala.appendChild(e);
		});
		pannello.appendChild(scala);

		/* piede: media della giornata e legenda */
		const piede = document.createElement("div");
		piede.className = "energy-foot";

		const testoMedia = document.createElement("span");
		testoMedia.className = "energy-media-testo";
		testoMedia.textContent = `Media ${this.euro(media)} €/kWh`;
		piede.appendChild(testoMedia);

		const legenda = document.createElement("span");
		legenda.className = "energy-legend";
		[["energy-bassa", "bassa"], ["energy-media-dot", "media"], ["energy-alta", "alta"]].forEach(
			([classe, etichetta]) => {
				const punto = document.createElement("i");
				punto.className = classe;
				legenda.appendChild(punto);
				legenda.appendChild(document.createTextNode(etichetta));
			}
		);
		piede.appendChild(legenda);
		pannello.appendChild(piede);

		return radice;
	}
});
