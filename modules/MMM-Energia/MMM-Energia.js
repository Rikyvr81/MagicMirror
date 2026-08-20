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
		/* Zona di offerta. Villafranca di Verona sta nel nord.
		   ATTENZIONE alle maiuscole: il servizio distingue
		   "IT-North" da "IT-NORTH" e rifiuta il secondo con un
		   400. Le altre zone italiane si scrivono allo stesso
		   modo: IT-Centre-North, IT-Centre-South, IT-South,
		   IT-Sicily, IT-Sardinia, IT-Calabria. */
		zona: "IT-North",

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

		/* Un titolo per colonna: le due misure non sono due parti
		   della stessa cosa e non condividono piu' un'unica riga. */
		titoloCosto: "COSTO ORARIO ENERGIA",
		titoloConsumo: "CONSUMO ATTUALE",

		/* ------------------------------------------------------
		   SHELLY
		   La chiave NON si scrive qui: sta su Render, in
		   Environment, come SHELLY_AUTH_KEY. Il node_helper la
		   legge da li' e la aggiunge alla richiesta, cosi' non
		   arriva mai al browser ne' finisce su GitHub.
		   Se manca, la colonna di destra lo dice esplicitamente.
		   ------------------------------------------------------ */
		shelly: {
			server: "",              // https://shelly-NN-eu.shelly.cloud
			id: "",                  // identificativo del dispositivo

			/* Lo Shelly EM ha due pinze. Qui si dichiara a cosa
			   sono collegate. Se ne usi una sola, metti null
			   sull'altra e la riga corrispondente sparisce. */
			canaleConsumo: 0,
			canaleProduzione: 1,

			/* VERSO DELLE PINZE
			   Una pinza amperometrica misura anche la direzione
			   della corrente, e se e' montata con la freccia dal
			   lato sbagliato la potenza risulta col segno
			   invertito. Sul canale della rete il segno e'
			   informazione vera (negativo = stai immettendo);
			   sul canale del fotovoltaico no, perche' un impianto
			   non consuma: se lo vedi negativo, la pinza e' girata
			   e va corretta qui.
			   Correggere il segno da software e' equivalente a
			   rigirare la pinza, e non richiede di aprire il
			   quadro. */
			invertiConsumo: false,
			invertiProduzione: true,

			/* Oltre quanti minuti dall'ultima misura il dato va
			   considerato vecchio. Il cloud continua a restituire
			   l'ultimo valore noto anche a dispositivo scollegato,
			   quindi senza questo controllo un numero fermo da ore
			   sembrerebbe attuale. */
			minutiFreschezza: 5,

			/* ESTREMI DELLA SCALA, in watt.
			   Il minimo e' negativo perche' con il fotovoltaico il
			   consumo scende sotto zero: la barra non si riempie
			   piu' da sinistra, ma parte dallo zero e cresce verso
			   destra se assorbi, verso sinistra se immetti.
			   Lo zero non sta quindi piu' a inizio barra ma a un
			   sesto della sua lunghezza, e viene marcato con un
			   trattino bianco: senza quel riferimento non si
			   capirebbe da che parte ci si trova. */
			scalaMin: -1000,
			scalaMax: 5000,

			/* SOGLIE DI COLORE DEL CONSUMO
			   Il numero grande, l'unita' di misura e la barra
			   cambiano colore secondo quanto stai assorbendo, cosi'
			   il livello si coglie prima ancora di leggere la
			   cifra.
			   Sotto zero e' BLU e non verde: il verde e' gia' il
			   colore della fascia oraria migriore nella colonna
			   accanto, e due segni identici che significano cose
			   diverse a seconda di dove guardi sono una trappola.
			   Il blu e' inoltre il colore convenzionale
			   dell'immissione in rete.
			   Ogni valore di "fino" e' il limite SUPERIORE in watt,
			   e l'elenco va letto dall'alto: si prende la prima
			   soglia non superata. Per cambiare i livelli basta
			   toccare questi numeri, ma ricordati di allineare le
			   tappe del gradiente in custom.css: sono le stesse
			   soglie, espresse in percentuale della scala. */
			soglie: [
				{ fino: 500, classe: "energy-livello-verde" },
				{ fino: 1000, classe: "energy-livello-giallo" },
				{ fino: 3000, classe: "energy-livello-arancio" }
			],
			classeImmissione: "energy-livello-blu",
			classeOltre: "energy-livello-rosso",

			/* Il cloud Shelly aggiorna lo stato ogni mezzo minuto
			   circa: chiedere piu' spesso non darebbe un dato piu'
			   fresco. */
			aggiornamento: 30 * 1000
		}
	},

	start: function () {
		/* FUSIONE DELLE IMPOSTAZIONI SHELLY
		   MagicMirror fonde config e defaults in modo
		   SUPERFICIALE: il blocco "shelly" scritto nel config.js
		   sostituisce per intero quello dei predefiniti invece di
		   integrarlo. Tutto cio' che non e' ripetuto nel config
		   risulta quindi indefinito.
		   Non e' un dettaglio teorico: e' costato un intervallo di
		   aggiornamento indefinito, e quindi un setInterval che
		   ripartiva senza sosta inondando il cloud di richieste.
		   Qui i due livelli si fondono a mano, una volta sola. */
		this.config.shelly = Object.assign(
			{},
			this.defaults.shelly,
			this.config.shelly || {}
		);

		this.prezzi = null;        // 24 valori in euro/kWh, oppure null
		this.fonte = null;         // "PUN" oppure "zonale"
		this.errore = null;        // messaggio dell'ultimo tentativo fallito
		this.potenze = null;       // { consumo, produzione } in watt
		this.erroreShelly = null;

		/* Lo Shelly ha un ritmo tutto suo, molto piu' rapido di
		   quello dei prezzi: due cicli indipendenti invece di uno
		   solo al passo del piu' lento. */
		if (this.config.shelly && this.config.shelly.server) {
			this.chiediShelly();
			setInterval(() => this.chiediShelly(), this.config.shelly.aggiornamento);
		}

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

		/* PRIMA IL PUN, POI IL PREZZO ZONALE
		   Il PUN e' il prezzo nazionale su cui il fornitore
		   fattura; il prezzo zonale del nord e' un'approssimazione
		   che diverge fino all'8% nelle ore serali di punta.
		   Si chiedono entrambi: se il portale del fornitore
		   cambiasse o smettesse di rispondere, il riquadro
		   ripiega sul valore zonale e lo dichiara, invece di
		   restare vuoto. Una degradazione dichiarata e' meglio di
		   un'assenza. */
		this.sendSocketNotification("PUN_SCARICA", { giorno: this.giornoRichiesto });
		this.sendSocketNotification("ENERGIA_SCARICA", { url: url, riserva: riserva });
	},

	/* Al node_helper servono solo server e identificativo: la
	   chiave la aggiunge lui, leggendola dall'ambiente. */
	chiediShelly: function () {
		this.sendSocketNotification("SHELLY_SCARICA", {
			server: this.config.shelly.server,
			id: this.config.shelly.id
		});
	},

	/* Struttura della risposta di uno Shelly EM (prima
	   generazione), verificata sulla documentazione del cloud:
	     data.device_status.emeters[n].power   potenza in watt
	   Il canale collegato alla rete puo' essere NEGATIVO quando
	   l'impianto produce piu' di quanto la casa consuma e il
	   surplus va in rete. Il segno si conserva: e' informazione,
	   non un errore da nascondere. */
	leggiPotenze: function (dati) {
		const stato = dati && dati.data && dati.data.device_status;
		const misure = stato && stato.emeters;
		if (!Array.isArray(misure)) throw new Error("risposta senza emeters");

		const canale = (n, inverti) => {
			if (n === null || n === undefined) return null;
			const m = misure[n];
			if (!m || typeof m.power !== "number") return null;
			return inverti ? -m.power : m.power;
		};

		/* ETA' DELLA MISURA
		   device_status._updated e' l'istante dell'ultima lettura,
		   scritto dal cloud in tempo universale e nella forma
		   "AAAA-MM-GG hh:mm:ss". Non e' una data ISO: senza la "Z"
		   finale il browser la interpreterebbe come ora locale e
		   d'estate il dato sembrerebbe vecchio di due ore. */
		let minuti = null;
		let istante = null;
		if (typeof stato._updated === "string") {
			const iso = stato._updated.trim().replace(" ", "T") + "Z";
			const t = Date.parse(iso);
			if (!Number.isNaN(t)) {
				istante = t;
				minuti = (Date.now() - t) / 60000;
			}
		}

		return {
			consumo: canale(this.config.shelly.canaleConsumo, this.config.shelly.invertiConsumo),
			produzione: canale(this.config.shelly.canaleProduzione, this.config.shelly.invertiProduzione),
			minuti: minuti,
			istante: istante,
			vecchio: minuti !== null && minuti > this.config.shelly.minutiFreschezza
		};
	},

	socketNotificationReceived: function (avviso, carico) {
		if (avviso === "SHELLY_DATI") {
			try {
				this.potenze = this.leggiPotenze(carico);
				this.erroreShelly = null;
			} catch (e) {
				this.erroreShelly = e.message;
			}
			this.updateDom();
			return;
		}

		if (avviso === "SHELLY_ERRORE") {
			this.erroreShelly = carico.messaggio;
			this.updateDom();
			return;
		}

		if (avviso === "PUN_DATI") {
			/* Il PUN arriva gia' ridotto a 24 valori orari dal
			   node_helper: la numerazione delle ore del portale non
			   dipende dal fuso, quindi non c'e' nulla da
			   riallineare qui. */
			this.prezzi = carico.ore;
			this.fonte = "PUN";
			this.errore = null;
			this.updateDom();
			return;
		}

		if (avviso === "PUN_ERRORE") {
			/* Non si mostra nulla: sta arrivando anche il prezzo
			   zonale, che fara' da riserva. Se fallisse pure
			   quello, sara' lui a scrivere l'errore. */
			return;
		}

		if (avviso === "ENERGIA_DATI") {
			/* Se il PUN e' gia' arrivato ha la precedenza: il
			   zonale serve solo come riserva. */
			if (this.fonte === "PUN") return;

			try {
				this.prezzi = this.riduciAOre(carico);
				this.fonte = "zonale";
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
	   Verificato il 20 agosto 2026: la zona IT-North risponde a
	   passo di QUINDICI MINUTI, cioe' 96 valori che coprono dalla
	   mezzanotte alle 23:45 locali. Non diamo comunque per
	   scontato il passo: raggruppiamo per ora locale e facciamo
	   la media, cosi' il codice regge anche se il mercato torna
	   al passo orario o scende a un passo piu' fitto.
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

	/* MEDIA GIORNALIERA A SEI DECIMALI
	   Tre decimali non bastavano: fra due giorni consecutivi la
	   media puo' differire oltre la terza cifra - 0,180890 contro
	   0,180905 - e a video il numero sembrava immobile. Sei cifre
	   sono anche quelle che usa il portale del fornitore, quindi
	   il confronto e' diretto, cifra per cifra.
	   Resta solo per la media: la fascia migliore tiene tre
	   decimali, perche' li' serve un ordine di grandezza da
	   leggere al volo, non una corrispondenza da verificare. */
	euroPreciso: function (v) {
		return v.toLocaleString("it-IT", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
	},

	/* ------------------------------------------------------
	   AIUTI DI FORMATO PER LA POTENZA
	   ------------------------------------------------------ */

	/* Sotto il chilowatt si scrivono i watt interi: "780 W" e'
	   piu' leggibile di "0,78 kW", e a quel livello i decimali
	   non aggiungono nulla. Sopra, due decimali come nell'app. */
	potenza: function (watt) {
		const segno = watt < 0 ? "-" : "";
		const v = Math.abs(watt);

		if (v < 1000) return { numero: segno + Math.round(v), unita: "W" };
		return {
			numero: segno + (v / 1000).toLocaleString("it-IT", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}),
			unita: "kW"
		};
	},

	/* Classe di colore per la potenza assorbita. Le soglie
	   arrivano dal config: cambiarle non richiede di toccare
	   questo codice. */
	livello: function (watt) {
		const s = this.config.shelly;
		if (watt < 0) return s.classeImmissione;

		const trovata = (s.soglie || []).find((x) => watt <= x.fino);
		return trovata ? trovata.classe : s.classeOltre;
	},

	/* ------------------------------------------------------
	   DISEGNO
	   Il pannello e' diviso in due colonne: a sinistra il costo
	   nell'arco della giornata, a destra il consumo istantaneo.
	   Le due parti hanno sorgenti e ritmi diversi, quindi ognuna
	   si disegna per conto suo: se una non risponde, l'altra
	   resta comunque a video.
	   ------------------------------------------------------ */

	/* intestazione della singola colonna, con la propria riga */
	intestazione: function (testo) {
		const e = document.createElement("div");
		e.className = "energy-col-header";
		e.textContent = testo;
		return e;
	},

	/* riga piccola sotto ciascuna colonna */
	nota: function (testo) {
		const e = document.createElement("div");
		e.className = "energy-note";
		e.textContent = testo;
		return e;
	},

	avviso: function (testo) {
		const e = document.createElement("div");
		e.className = "energy-avviso";
		e.textContent = testo;
		return e;
	},

	/* ---- colonna di sinistra: costo ---- */
	colonnaCosto: function () {
		const col = document.createElement("div");
		col.className = "energy-col energy-col-costo";
		col.appendChild(this.intestazione(this.config.titoloCosto));

		if (!this.prezzi) {
			col.appendChild(this.avviso(
				this.errore ? `Prezzi non disponibili: ${this.errore}` : "Caricamento in corso"
			));
			return col;
		}

		const ore = this.prezzi;
		const fasce = this.calcolaFasce(ore);
		const migliore = this.miglioreFinestra(ore);
		const validi = ore.filter((v) => v !== null);
		const media = validi.reduce((a, b) => a + b, 0) / validi.length;
		const adesso = this.config.giorno === 0 ? new Date().getHours() : -1;

		/* ETICHETTA ACCANTO ALL'ORARIO
		   Da quando la riga sotto porta il costo dell'ora in corso,
		   l'orario grande era rimasto senza didascalia: chi guarda
		   la parete senza sapere com'e' fatto il riquadro leggeva
		   "12:00 - 15:00" senza capire cosa fosse.
		   L'etichetta sta di FIANCO e non sopra perche' sopra
		   costerebbe una riga di altezza e sfaserebbe le due
		   colonne; su due righe corte occupa l'altezza che il
		   numero ha gia'. */
		const riga = document.createElement("div");
		riga.className = "energy-best-row";

		const tag = document.createElement("span");
		tag.className = "energy-best-tag";
		tag.textContent = "Fascia consigliata";
		riga.appendChild(tag);

		const titolo = document.createElement("span");
		titolo.className = "energy-best-hours";
		titolo.textContent = migliore
			? `${this.oraDue(migliore.ora)} – ${this.oraDue(migliore.ora + this.config.finestra)}`
			: "—";
		riga.appendChild(titolo);

		col.appendChild(riga);

		/* La riga sotto porta il costo dell'ORA IN CORSO, che e'
		   l'unico dato del riquadro a cambiare durante la
		   giornata: il numero grande sopra e' la fascia migliore e
		   resta fisso fino a mezzanotte.
		   Sei decimali come nella media, cosi' il confronto col
		   portale del fornitore e' diretto; a 14px la riga misura
		   circa 175px e ne ha 205 a disposizione.
		   Se stessimo guardando DOMANI - giorno: 1 - un "costo
		   attuale" non avrebbe senso, e si torna a descrivere la
		   fascia migliore. */
		const sotto = document.createElement("div");
		sotto.className = "energy-best-avg";

		if (adesso >= 0 && ore[adesso] !== null) {
			sotto.textContent = `costo attuale: ${this.euroPreciso(ore[adesso])} €/kWh`;
		} else if (migliore) {
			sotto.textContent = `fascia migliore: ${this.euro(migliore.media)} €/kWh`;
		} else {
			sotto.textContent = "";
		}
		col.appendChild(sotto);

		const barra = document.createElement("div");
		barra.className = "energy-bar";
		fasce.forEach((f, h) => {
			const seg = document.createElement("span");
			seg.className = "energy-seg" + (f ? ` energy-${f}` : "") + (h === adesso ? " energy-adesso" : "");
			barra.appendChild(seg);
		});
		col.appendChild(barra);

		const scala = document.createElement("div");
		scala.className = "energy-ticks";
		["00", "06", "12", "18", "24"].forEach((t) => {
			const e = document.createElement("span");
			e.textContent = t;
			scala.appendChild(e);
		});
		col.appendChild(scala);

		/* NOTA A PIE' DI COLONNA: MEDIA E FONTE
		   Due voci sulla stessa riga, la media a sinistra e la
		   fonte a destra. Prima la fonte compariva solo nel caso
		   degradato, appesa alla media come "· zonale": dichiararla
		   sempre costa nulla e toglie l'ambiguita' del silenzio -
		   se non vedi scritto niente, non sai se stai guardando il
		   PUN o hai smesso di guardarlo.
		     PUN = prezzo nazionale, quello su cui il fornitore
		           fattura
		     NRD = prezzo zonale del nord, la riserva */
		const piede = document.createElement("div");
		piede.className = "energy-note";

		const testoMedia = document.createElement("span");
		testoMedia.textContent = `Media ${this.euroPreciso(media)} €/kWh`;
		piede.appendChild(testoMedia);

		const testoFonte = document.createElement("span");
		testoFonte.textContent = `Fonte: ${this.fonte === "zonale" ? "NRD" : "PUN"}`;
		piede.appendChild(testoFonte);

		col.appendChild(piede);
		return col;
	},

	/* ---- colonna di destra: consumo ---- */
	colonnaConsumo: function () {
		const col = document.createElement("div");
		col.className = "energy-col energy-col-consumo";
		col.appendChild(this.intestazione(this.config.titoloConsumo));

		if (!this.potenze) {
			col.appendChild(this.avviso(
				this.erroreShelly ? `Shelly: ${this.erroreShelly}` : "Lettura in corso"
			));
			return col;
		}

		const consumo = this.potenze.consumo;

		if (consumo === null) {
			col.appendChild(this.avviso("Canale non disponibile"));
			return col;
		}

		/* Con impianto fotovoltaico il canale della rete va sotto
		   zero quando si immette: in quel caso il numero grande
		   perde di senso come "consumo" e cambia etichetta. */
		const immissione = consumo < 0;
		const lettura = this.potenza(consumo);

		/* Stessa struttura della colonna accanto - una riga di
		   altezza fissa che contiene il numero grande - cosi' le
		   due restano allineate anche ora che a sinistra c'e'
		   un'etichetta in piu'. */
		const riga = document.createElement("div");
		riga.className = "energy-best-row";

		const numero = document.createElement("span");
		numero.className = `energy-now ${this.livello(consumo)}`;
		numero.textContent = lettura.numero;

		const unita = document.createElement("span");
		unita.className = "energy-now-unit";
		unita.textContent = ` ${lettura.unita}`;
		numero.appendChild(unita);

		riga.appendChild(numero);
		col.appendChild(riga);

		/* Sotto il numero grande va la PRODUZIONE, nello stesso
		   posto in cui la colonna accanto scrive il prezzo della
		   fascia migliore. Prima qui c'era un'etichetta che
		   ripeteva a parole cio' che il segno gia' diceva
		   ("in rete adesso" quando il numero era negativo): una
		   riga spesa per non aggiungere nulla, mentre la
		   produzione era relegata in fondo e le due colonne
		   risultavano sfalsate.
		   Il colore del numero dice ora quello che diceva
		   l'etichetta, e lo dice prima che tu abbia letto la
		   cifra. */
		const sotto = document.createElement("div");
		sotto.className = "energy-now-label";

		if (this.potenze.produzione !== null) {
			const p = this.potenza(this.potenze.produzione);
			sotto.textContent = `Produzione ${p.numero} ${p.unita}`;
		} else {
			/* senza la seconda pinza la produzione non si sa, e
			   allora torna utile dire cosa sia il numero grande */
			sotto.textContent = immissione ? "in rete adesso" : "consumo adesso";
		}
		col.appendChild(sotto);

		/* POSIZIONI SULLA SCALA
		   La barra copre l'intervallo da scalaMin a scalaMax, e
		   ogni valore diventa una percentuale della sua lunghezza.
		   Il pieno non parte dal bordo sinistro ma dallo zero, e
		   si estende verso destra o verso sinistra a seconda del
		   segno. */
		const min = this.config.shelly.scalaMin;
		const max = this.config.shelly.scalaMax;
		const posizione = (w) =>
			Math.max(0, Math.min(100, ((w - min) / (max - min)) * 100));

		const posZero = posizione(0);
		const posOra = posizione(consumo);
		const inizio = Math.min(posZero, posOra);
		const fine = Math.max(posZero, posOra);

		const misuratore = document.createElement("div");
		misuratore.className = "energy-meter";
		/* LA BARRA E' UN GRADIENTE MASCHERATO
		   Il fondo porta l'intera scala dei colori, dal giallo al
		   viola, sfumata. Sopra ci sta una maschera che copre la
		   parte non raggiunta: quello che resta scoperto e' quindi
		   colorato secondo il punto della scala in cui ti trovi,
		   e le tinte trascolorano invece di scattare.
		   Il riempimento a tinta unita non lo permetteva: il
		   colore sarebbe cambiato di netto al superamento di ogni
		   soglia.
		   In immissione la barra e' invece tutta verde: li' non
		   siamo su quella scala, siamo dall'altra parte dello
		   zero. */
		/* IL GRADIENTE SI RITAGLIA, NON SI COPRE
		   Il primo tentativo metteva il gradiente sull'intera
		   barra e ci sovrapponeva due maschere grigie sui tratti
		   non raggiunti. Non funzionava: quel grigio e'
		   semitrasparente, per lasciar vedere la fotografia sotto,
		   e quindi lasciava trasparire anche il gradiente. La
		   barra appariva sempre tutta colorata, qualunque fosse il
		   consumo.
		   Qui invece si ritaglia una finestra larga quanto il
		   tratto fra lo zero e il valore attuale, e dentro ci si
		   mette il gradiente dell'INTERA scala, riposizionato in
		   modo che il pezzo visibile sia esattamente quello giusto.
		   Fuori dalla finestra resta il fondo grigio della barra,
		   senza nulla sopra. */
		const larghezza = fine - inizio;

		if (larghezza > 0) {
			const finestra = document.createElement("div");
			finestra.className = "energy-meter-window";
			finestra.style.left = `${inizio}%`;
			finestra.style.width = `${larghezza}%`;

			/* Il gradiente e' largo quanto l'intera scala: se la
			   finestra ne mostra un ventesimo, il gradiente dentro
			   di essa deve essere venti volte piu' largo, e
			   spostato a sinistra di quanto la finestra dista
			   dall'origine. Cosi' i colori restano ancorati ai
			   valori e non si stirano insieme alla finestra. */
			const scalaColori = document.createElement("div");
			scalaColori.className = "energy-meter-scala";
			scalaColori.style.width = `${(100 / larghezza) * 100}%`;
			scalaColori.style.left = `${(-inizio / larghezza) * 100}%`;

			finestra.appendChild(scalaColori);
			misuratore.appendChild(finestra);
		}

		/* Trattino dello zero, sopra tutto: e' il riferimento che
		   rende leggibile il resto. */
		const zero = document.createElement("div");
		zero.className = "energy-meter-zero";
		zero.style.left = `${posZero}%`;
		misuratore.appendChild(zero);

		col.appendChild(misuratore);

		const scala = document.createElement("div");
		scala.className = "energy-ticks";
		const etichetta = (w) => {
			const p = this.potenza(w);
			const e = document.createElement("span");
			e.textContent = `${p.numero} ${p.unita}`;
			return e;
		};
		scala.appendChild(etichetta(min));
		scala.appendChild(etichetta(max));
		col.appendChild(scala);

		/* ORARIO DELLA MISURA, SEMPRE VISIBILE
		   Prima compariva solo quando il dato superava la soglia,
		   ma quell'avviso dipende dal campo _updated: se il cloud
		   non lo mandasse, o lo mandasse in un formato diverso,
		   l'eta' risulterebbe sconosciuta e non si direbbe nulla.
		   Un numero fermo da ore senza segnalazione e' lo scenario
		   peggiore, quindi l'orario si mostra sempre: se e' fermo
		   te ne accorgi guardandolo, senza dover dedurre nulla.
		   Sta sulla stessa riga della produzione per non costare
		   altezza. */
		/* ORARIO DELL'ULTIMA MISURA
		   Ultima riga della colonna, alla stessa quota di
		   "Media ... €/kWh" a sinistra: entrambe sono note a pie'
		   di colonna, e stanno bene sulla stessa riga.
		   Si mostra sempre, non solo quando il dato e' vecchio: un
		   numero fermo da ore senza segnalazione e' lo scenario
		   peggiore, e l'avviso dipende da un campo che il cloud
		   potrebbe non mandare. Cosi' se ne' l'orario ne' il numero
		   si muovono, te ne accorgi guardando. */
		const orario = document.createElement("div");
		orario.className = "energy-note energy-note-tempo";
		orario.textContent = this.potenze.istante !== null
			? `ultimo aggiornamento alle ${new Date(this.potenze.istante).toLocaleTimeString("it-IT", {
					hour: "2-digit",
					minute: "2-digit"
				})}`
			: "orario dell'ultima misura non disponibile";

		if (this.potenze.vecchio || this.potenze.istante === null) {
			orario.classList.add("energy-note-vecchia");
		}
		col.appendChild(orario);

		return col;
	},

	getDom: function () {
		const radice = document.createElement("div");
		radice.className = "energy-block";

		/* Nessuna intestazione unica: ogni colonna porta la
		   propria, cosi' titolo e contenuto restano attaccati. */
		const pannello = document.createElement("div");
		pannello.className = "energy-panel";
		pannello.appendChild(this.colonnaCosto());

		/* la colonna del consumo compare solo se lo Shelly e'
		   configurato: senza server il riquadro resta a una
		   colonna sola, come prima */
		if (this.config.shelly && this.config.shelly.server) {
			pannello.appendChild(this.colonnaConsumo());
		} else {
			pannello.classList.add("energy-panel-singola");
		}

		radice.appendChild(pannello);
		return radice;
	}
});
