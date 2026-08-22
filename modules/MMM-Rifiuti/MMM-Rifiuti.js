/* ==========================================================
   MMM-Rifiuti
   "Oggi metti fuori: CARTA"

   Il calendario del Comune indica il giorno del RITIRO, ma il
   bidone si mette fuori la sera prima. Il modulo fa quindi uno
   scarto di un giorno: nella cella di oggi scrive cosa si
   raccoglie domani.

   PERCHE' LA SCRITTA STA NELLA CELLA DI OGGI
   Perche' e' li' che l'occhio va a cercare cosa succede adesso,
   e perche' non serve un orario: se e' scritto nel riquadro di
   oggi, e' per stasera. Una fascia separata avrebbe richiesto di
   decidere da che ora accenderla e quando spegnerla.

   COME CI ARRIVA IL TESTO
   Non inserendo elementi nella cella - il calendario le
   ricostruisce di continuo e sparirebbero - ma con una regola di
   stile agganciata a data-date, come per il budget. Li' pero'
   ::before e ::after della cella sono gia' occupati, quindi qui
   si usa quello dell'intestazione, ancorato al fondo del
   riquadro.
   ========================================================== */

Module.register("MMM-Rifiuti", {
	defaults: {
		/* Codice del foglio: la parte del link dopo /d/ */
		foglio: "",

		/* Nome della scheda. Vuoto = la prima, che e' il caso di un
		   documento a scheda unica. */
		scheda: "",

		/* FRASE MOSTRATA NELLA CELLA
		   Le parentesi graffe sono il posto dove finisce il tipo di
		   raccolta. Erano un prefisso e basta, ma cosi' il nome puo'
		   stare anche in mezzo alla frase invece che solo in coda.
		   Se allunghi il testo tieni d'occhio la larghezza: la cella
		   e' larga circa 198px e oltre una certa lunghezza la frase
		   viene troncata con dei puntini. */
		testo: "RIFIUTI - Conferire {} in serata",

		/* VALORI CHE NON SONO UNA RACCOLTA
		   Nel calendario compare "NO SERVIZIO" per i giorni in cui
		   il ritiro salta. Scritto tale e quale direbbe "oggi metti
		   fuori NO SERVIZIO", cioe' l'esatto contrario del vero.
		   Il confronto ignora maiuscole e spazi. */
		nonRaccolte: ["NO SERVIZIO"],

		/* Il calendario cambia una volta l'anno: rileggerlo di rado
		   basta e avanza. Il giro serve piu' che altro a
		   riprendersi da un errore. */
		intervallo: 60 * 60 * 1000,
		riprova: 5 * 60 * 1000
	},

	start: function () {
		this.righe = null;

		this.chiedi();
		setInterval(() => this.chiedi(), this.config.intervallo);

		/* Un giro al minuto per il cambio di giornata: a mezzanotte
		   "domani" diventa un altro giorno e la scritta si sposta
		   nella cella successiva. Non rilegge il foglio. */
		setInterval(() => this.updateDom(), 60 * 1000);
	},

	chiedi: function () {
		this.sendSocketNotification("RIFIUTI_CHIEDI", {
			foglio: this.config.foglio,
			scheda: this.config.scheda
		});
	},

	socketNotificationReceived: function (avviso, carico) {
		if (avviso === "RIFIUTI_DATI") {
			this.righe = carico.righe || [];
			this.updateDom();
			return;
		}

		if (avviso === "RIFIUTI_ERRORE") {
			console.error("MMM-Rifiuti:", carico.messaggio);
			setTimeout(() => this.chiedi(), this.config.riprova);
		}
	},

	/* Data del foglio in "AAAA-MM-GG". Il formato e' quello
	   italiano, 22/08/2026. Si legge come TESTO e non con Date:
	   una conversione userebbe il fuso del browser e potrebbe
	   spostare la giornata. */
	giorno: function (testo) {
		const t = (testo || "").trim();

		const it = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
		if (it) return `${it[3]}-${it[2].padStart(2, "0")}-${it[1].padStart(2, "0")}`;

		const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
		if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

		return null;
	},

	etichetta: function (d) {
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const g = String(d.getDate()).padStart(2, "0");
		return `${d.getFullYear()}-${m}-${g}`;
	},

	/* Cosa si raccoglie domani. Restituisce null se non c'e' nulla
	   da mettere fuori: giorno vuoto, giorno non presente nel
	   foglio, oppure un valore che raccolta non e'. */
	domani: function () {
		if (!this.righe) return null;

		const oggi = new Date();
		const domani = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + 1);
		const cercata = this.etichetta(domani);

		const riga = this.righe.find((r) => this.giorno(r.data) === cercata);
		if (!riga) return null;

		const raccolta = (riga.raccolta || "").trim();
		if (!raccolta) return null;

		const escluse = (this.config.nonRaccolte || []).map((v) => v.trim().toUpperCase());
		if (escluse.includes(raccolta.toUpperCase())) return null;

		return raccolta;
	},

	/* Le regole vanno nell'INTESTAZIONE della pagina: MagicMirror
	   ripulisce il contenuto dei moduli dagli elementi <style>, e
	   un foglio annidato qui dentro sparirebbe senza lasciare
	   traccia. Si scrive sempre sullo stesso elemento, riconosciuto
	   dal suo identificativo, cosi' non se ne accumulano copie. */
	scriviRegole: function (testo) {
		let stile = document.getElementById("mmm-rifiuti-regole");

		if (!stile) {
			stile = document.createElement("style");
			stile.id = "mmm-rifiuti-regole";
			document.head.appendChild(stile);
		}

		stile.textContent = testo;
	},

	/* Il testo va nelle virgolette di una regola CSS: una
	   virgoletta doppia dentro il nome di una raccolta
	   spezzerebbe la regola e la farebbe scartare in silenzio. */
	protetto: function (t) {
		return String(t).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	},

	getDom: function () {
		/* Il modulo non disegna nulla di suo: tutto il suo effetto
		   sta nella regola che scrive. Il div resta vuoto. */
		const radice = document.createElement("div");
		radice.className = "rifiuti-block";

		const raccolta = this.domani();

		if (!raccolta) {
			this.scriviRegole("");
			return radice;
		}

		const oggi = new Date();
		const istante = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()).getTime();
		/* Se nella frase mancassero le graffe, il nome della
		   raccolta si perderebbe del tutto: in quel caso lo si
		   accoda, che e' meglio di una riga senza informazione. */
		const modello = this.config.testo || "{}";
		const frase = modello.includes("{}")
			? modello.replace("{}", raccolta)
			: `${modello} ${raccolta}`;

		const testo = this.protetto(frase);

		this.scriviRegole(
			`.CX3_basicCalendar .cell[data-date="${istante}"] .cellHeader::after{content:"${testo}";}`
		);

		return radice;
	}
});
