/* ==========================================================
   MMM-Budget
   Budget familiare del mese.

   I dati stanno in un foglio Google, non qui e nemmeno sul
   server: il disco di Render si azzera a ogni deploy e a ogni
   risveglio dalla sospensione, quindi qualunque cosa scrivessimo
   li' sparirebbe dopo qualche settimana di spese registrate.
   Il foglio ha due schede - Budget e Spese - e le spese ci
   arrivano da un modulo Google, che si compila dal telefono in
   cinque secondi.

   La dashboard LEGGE soltanto. Non scrive mai nulla: e' anche il
   motivo per cui un errore qui non puo' rovinare i dati.

   PERCHE' I CALCOLI STANNO IN QUESTO FILE
   Perche' qui si conosce il fuso orario giusto. Il server lavora
   in tempo universale, e stabilire li' quale sia "oggi" darebbe
   il giorno sbagliato per due ore ogni notte - lo stesso
   inciampo del tramonto nel meteo e delle ore del PUN.
   ========================================================== */

Module.register("MMM-Budget", {
	defaults: {
		/* Codice del foglio: la parte del link dopo /d/ */
		foglio: "",

		schedaBudget: "Budget",
		schedaSpese: "Spese",

		/* Testo che precede l'importo dentro ogni cella. E' una
		   costante: la larghezza riservata all'etichetta nel
		   custom.css - --budget-etichetta-larghezza - e' tarata su
		   questa lunghezza, quindi se la allunghi ritocca anche
		   quella o il numero ci finisce sopra. */
		etichettaCella: "Budget disponibile: ",

		/* Il foglio cambia poco e il flag "visibile" non serve
		   che reagisca in un attimo: dieci minuti bastano. */
		intervallo: 10 * 60 * 1000,
		riprova: 2 * 60 * 1000
	},

	start: function () {
		this.dati = null;
		this.errore = null;

		this.chiedi();
		setInterval(() => this.chiedi(), this.config.intervallo);

		/* Un giro al minuto per accorgersi del cambio di giornata:
		   a mezzanotte cambiano i giorni trascorsi, e con loro il
		   disponibile. Non rilegge il foglio, ridisegna soltanto. */
		setInterval(() => this.updateDom(), 60 * 1000);
	},

	chiedi: function () {
		this.sendSocketNotification("BUDGET_CHIEDI", {
			foglio: this.config.foglio,
			schedaBudget: this.config.schedaBudget,
			schedaSpese: this.config.schedaSpese
		});
	},

	socketNotificationReceived: function (avviso, carico) {
		if (avviso === "BUDGET_DATI") {
			this.dati = carico;
			this.errore = null;
			this.updateDom();
			return;
		}

		if (avviso === "BUDGET_ERRORE") {
			this.errore = carico.messaggio;
			setTimeout(() => this.chiedi(), this.config.riprova);
			this.updateDom();
		}
	},

	/* ------------------------------------------------------
	   LETTURA DEI VALORI DAL FOGLIO
	   ------------------------------------------------------ */

	/* Un importo puo' arrivare come "50", "50,00" o "1.234,50" a
	   seconda di come e' formattata la cella e di come lo scrive
	   chi compila il modulo. Qui si accettano tutte le forme. */
	numero: function (testo) {
		if (typeof testo !== "string") return null;

		const pulito = testo.replace(/[^\d,.-]/g, "").trim();
		if (!pulito) return null;

		/* Se ci sono sia punti sia virgole, il separatore decimale
		   e' l'ULTIMO dei due: "1.234,50" all'italiana, "1,234.50"
		   all'inglese. Con uno solo, la virgola e' decimale e il
		   punto pure. */
		let normalizzato;
		const ultimaVirgola = pulito.lastIndexOf(",");
		const ultimoPunto = pulito.lastIndexOf(".");

		if (ultimaVirgola >= 0 && ultimoPunto >= 0) {
			normalizzato = ultimaVirgola > ultimoPunto
				? pulito.replace(/\./g, "").replace(",", ".")
				: pulito.replace(/,/g, "");
		} else {
			normalizzato = pulito.replace(",", ".");
		}

		const v = parseFloat(normalizzato);
		return Number.isFinite(v) ? v : null;
	},

	/* Il flag "visibile" accetta qualunque forma ragionevole,
	   perche' chi compila il foglio non deve ricordarsi una
	   convenzione: si', si, x, vero, 1 valgono tutti. */
	acceso: function (testo) {
		return /^(s[iì]|x|v|vero|true|1|y|yes)$/i.test((testo || "").trim());
	},

	/* Da una data del foglio a "AAAA-MM-GG".
	   Due formati possibili: quello italiano del modulo Google,
	   "21/08/2026 18.19.04", e quello che potresti scrivere a mano
	   nella colonna Data. Si legge come TESTO e non con Date: una
	   conversione userebbe il fuso del browser e potrebbe
	   spostare la spesa di un giorno. */
	giorno: function (testo) {
		const t = (testo || "").trim();
		if (!t) return null;

		const italiana = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
		if (italiana) {
			const [, g, m, a] = italiana;
			return `${a}-${m.padStart(2, "0")}-${g.padStart(2, "0")}`;
		}

		const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
		if (iso) {
			const [, a, m, g] = iso;
			return `${a}-${m.padStart(2, "0")}-${g.padStart(2, "0")}`;
		}

		return null;
	},

	/* ------------------------------------------------------
	   IL CONTO

	   Il riporto non si calcola giorno per giorno: viene da se'.
	   Il disponibile di oggi e' la quota moltiplicata per i giorni
	   trascorsi, meno tutto lo speso. Se ieri hai risparmiato, oggi
	   lo ritrovi; se hai sforato, oggi lo paghi. Nessuna
	   contabilita' da tenere.
	   ------------------------------------------------------ */
	conto: function () {
		if (!this.dati) return null;

		const oggi = new Date();
		const anno = oggi.getFullYear();
		const mese = String(oggi.getMonth() + 1).padStart(2, "0");
		const etichetta = `${anno}-${mese}`;

		const riga = (this.dati.budget || []).find(
			(r) => (r.mese || "").trim() === etichetta
		);

		/* Nessuna riga per questo mese: e' la scelta dichiarata -
		   niente budget, niente controllo, niente a video. */
		if (!riga) return null;
		if (!this.acceso(riga.visibile)) return null;

		const budget = this.numero(riga.budget);
		if (budget === null) return null;

		/* Giorni del mese: il giorno zero del mese successivo e'
		   l'ultimo di questo, ed e' il modo piu' sicuro di contarli
		   senza tabelle e senza casi speciali per febbraio. */
		const giorniMese = new Date(anno, oggi.getMonth() + 1, 0).getDate();
		const quota = budget / giorniMese;
		const giorno = oggi.getDate();

		let speso = 0;
		(this.dati.spese || []).forEach((s) => {
			/* La colonna Data ha la precedenza sull'orario di
			   inserimento: serve proprio a registrare la sera una
			   spesa del mattino, o a recuperare due giorni dopo. */
			const data = this.giorno(s.data) || this.giorno(s.informazionicronologiche);
			if (!data || !data.startsWith(etichetta)) return;

			const importo = this.numero(s.importo);
			if (importo !== null) speso += importo;
		});

		return {
			budget: budget,
			speso: speso,
			quota: quota,
			giorniMese: giorniMese,
			giorno: giorno,
			residuoMese: budget - speso,
			disponibileOggi: quota * giorno - speso
		};
	},

	/* ------------------------------------------------------
	   IL BUDGET GIORNO PER GIORNO

	   Tre situazioni diverse, una per ciascuna parte del mese:

	   GIORNI PASSATI - niente. Sono chiusi, e mostrarne il saldo
	   sarebbe rumore: non ci puoi piu' fare nulla.

	   OGGI - la quota moltiplicata per i giorni trascorsi meno
	   tutto lo speso. E' qui che si vede il riporto: se nei giorni
	   scorsi hai risparmiato, oggi lo ritrovi accumulato.

	   GIORNI FUTURI - la quota secca. NON il progressivo: su venti
	   giorni davanti diventerebbe un numero enorme e privo di
	   significato, mentre la domanda a cui serve rispondere e'
	   "quanto posso spendere quel giorno".

	   LO SFONDAMENTO SI PROPAGA
	   Se oggi hai speso piu' di quanto avevi, il disponibile non
	   diventa negativo: si ferma a zero e il rosso passa al giorno
	   dopo, riducendone la quota. Se non basta neanche quella, si
	   propaga ancora. E' il comportamento di un budget vero: il
	   debito non sparisce, si sposta.
	   ------------------------------------------------------ */
	perGiorno: function (c) {
		const giorni = new Map();
		const oggi = new Date();
		const anno = oggi.getFullYear();
		const indiceMese = oggi.getMonth();

		/* Quanto manca a coprire le spese gia' fatte. Se il
		   disponibile di oggi e' negativo, quel negativo e' il
		   debito da spalmare sui giorni successivi. */
		let debito = Math.max(0, -c.disponibileOggi);

		for (let g = c.giorno; g <= c.giorniMese; g++) {
			let valore;

			if (g === c.giorno) {
				valore = Math.max(0, c.disponibileOggi);
			} else {
				valore = c.quota - debito;
				if (valore < 0) {
					debito = -valore;
					valore = 0;
				} else {
					debito = 0;
				}
			}

			/* La chiave e' l'istante di mezzanotte locale, lo stesso
			   che il calendario scrive in data-date su ogni cella.
			   Verificato: fra una cella e la successiva passano 24
			   ore esatte e il valore corrisponde alla mezzanotte del
			   giorno, non a un orario universale. */
			giorni.set(new Date(anno, indiceMese, g).getTime(), valore);
		}

		return giorni;
	},

	/* Regole di stile, una coppia per giorno.

	   PERCHE' NON INSERISCO ELEMENTI NELLE CELLE
	   Le celle le costruisce il calendario, e le RIFA' da capo a
	   ogni aggiornamento: qualunque cosa ci infilassi dentro
	   sparirebbe al primo arrivo di eventi. Una regola di stile
	   invece non e' un oggetto nel documento, e continua a valere
	   anche per le celle ricostruite un attimo fa.

	   PERCHE' DUE PSEUDO-ELEMENTI E NON UNO
	   Perche' il colore deve stare solo sul numero. Con un solo
	   contenuto generato, "Budget disponibile: 630€" sarebbe tutto
	   verde o tutto rosso, e a colpo d'occhio sembrerebbe un
	   allarme anche quando e' una buona notizia. Cosi' invece
	   ::before porta l'etichetta, sempre neutra, e ::after il
	   valore, che si colora. */
	regole: function (c) {
		const giorni = this.perGiorno(c);
		const righe = [];

		giorni.forEach((valore, istante) => {
			/* Il confronto si fa sui valori arrotondati, gli stessi
			   che finiscono a video: altrimenti un giorno da
			   29,0001 contro una quota di 29,03 risulterebbe "sotto
			   la media" pur mostrando lo stesso numero del vicino. */
			const mostrato = Math.round(valore);
			const riferimento = Math.round(c.quota);

			let stile = "";
			if (mostrato > riferimento) stile = "color:var(--budget-verde);font-weight:700;";
			else if (mostrato < riferimento || mostrato === 0) stile = "color:var(--budget-rosso);font-weight:700;";

			const sel = `.CX3_basicCalendar .cell[data-date="${istante}"]`;
			righe.push(`${sel}::before{content:"${this.config.etichettaCella}";}`);
			righe.push(`${sel}::after{content:"${this.euro(valore)}";${stile}}`);
		});

		return righe.join("\n");
	},

	/* ------------------------------------------------------
	   DISEGNO
	   ------------------------------------------------------ */
	euro: function (v) {
		return `${Math.round(v).toLocaleString("it-IT")}€`;
	},

	riga: function (etichetta, valore, rosso) {
		const r = document.createElement("div");
		r.className = "budget-riga";

		const e = document.createElement("span");
		e.className = "budget-etichetta";
		e.textContent = etichetta;
		r.appendChild(e);

		/* Il colore va SOLO sul numero: l'etichetta resta neutra,
		   altrimenti a colpo d'occhio sembra tutto un allarme. */
		const v = document.createElement("span");
		v.className = "budget-valore" + (rosso ? " budget-rosso" : "");
		v.textContent = valore;
		r.appendChild(v);

		return r;
	},

	getDom: function () {
		const radice = document.createElement("div");
		radice.className = "budget-block";

		const c = this.conto();

		/* Silenzio volontario: mese non presente nel foglio, oppure
		   segnato come non visibile. Non e' un guasto. */
		if (!c) return radice;

		radice.appendChild(this.riga("BUDGET DEL MESE: ", this.euro(c.budget), false));
		radice.appendChild(
			this.riga("BUDGET RESIDUO: ", this.euro(c.residuoMese), c.residuoMese < 0)
		);

		/* Le regole per le celle viaggiano dentro il DOM di questo
		   modulo: un foglio di stile vale per tutto il documento
		   anche se sta annidato qui dentro, e cosi' viene rifatto
		   da solo a ogni ridisegno senza doverlo inseguire a mano
		   nell'intestazione della pagina. */
		const stile = document.createElement("style");
		stile.textContent = this.regole(c);
		radice.appendChild(stile);

		return radice;
	}
});
