/* ==========================================================
   ELENCO UNICO DEI CALENDARI
   Definiti una volta sola: da qui vengono generati sia l'elenco
   del modulo feeder, sia il filtro calendarSet, sia la legenda
   nell'intestazione. Per aggiungere o togliere un calendario
   basta modificare questo array.
   - name  : identificativo tecnico (usato da CalendarExt3)
   - label : come compare nella legenda
   - color : colore degli eventi
   ========================================================== */
const CALENDARI = [
	{
		name: "riky",
		label: "Riky",
		color: "#1E88E5",          // azzurro
		symbol: "user",
		url: "https://calendar.google.com/calendar/ical/rikyvr81%40gmail.com/private-091b2d1fdfaa0054cd0a15f4363f00bf/basic.ics"
	},
	{
		name: "edo",
		label: "Edo",
		color: "#F4511E",          // arancione
		symbol: "graduation-cap",
		url: "https://calendar.google.com/calendar/ical/682a77c84795bac5baa2f0ff5ebb447ee24e5a553ffe0ca307632efe247024a5%40group.calendar.google.com/private-194b094b27d453d72e4e15d1e2433c10/basic.ics"
	},
	{
		name: "elisa",
		label: "Elisa",
		color: "#8E24AA",          // viola
		symbol: "heart",
		url: "https://calendar.google.com/calendar/ical/8a8303d6c9d753395145c46d27723c13f219273c7d1b3cc15872c022a4081733%40group.calendar.google.com/private-a43e5bd04737250a3451f8cc0fd25a57/basic.ics"
	},
	{
		name: "greta",
		label: "Greta",
		color: "#D81B60",          // rosa
		symbol: "star",
		url: "https://calendar.google.com/calendar/ical/b0d18bd86e45ab24f0f45b1d816758e42232230c158a75df1627279572fd0623%40group.calendar.google.com/private-682741cc7674ec627a203efe50ab1c49/basic.ics"
	},
	{
		name: "turni",
		label: "Turni",
		color: "#5FE3FF",          // ciano brillante - reso a BORDO (vedi custom.css)
		soloBordo: true,           // anche il quadratino in legenda e' a bordo
		symbol: "clock",
		url: "https://calendar.google.com/calendar/ical/2b749a933db9a1b6a27becb92f1e2c236c527fb123df06e03f33ac8e46f79dcd%40group.calendar.google.com/private-3f7c509824a09b7a811a92950e96f185/basic.ics"
	},
	{
		name: "varie",
		label: "Varie",
		color: "#FDD835",          // giallo (testo scurito dal custom.css)
		symbol: "thumbtack",
		url: "https://calendar.google.com/calendar/ical/2af84157eac2f333feeb2aaf8cf678e82c71419c524933adb00a5081ddb53339%40group.calendar.google.com/private-564182440799ca5cac8d48b0624dd7dc/basic.ics"
	},
	{
		name: "festivita",
		label: "Festività",
		color: "#6EE787",          // verde brillante - reso a BORDO (vedi custom.css)
		soloBordo: true,
		symbol: "flag",
		url: "https://calendar.google.com/calendar/ical/it.italian%23holiday%40group.v.calendar.google.com/public/basic.ics"
	}
];

/* Token Todoist: definito una volta sola e riusato da tutte le istanze
   del modulo, cosi' quando lo rigeneri c'e' un solo punto da aggiornare. */
const TODOIST_TOKEN = "b5165897484eaae9d7d53d4f5d6378886a331bb5";   // >>> UNICO PUNTO DA COMPILARE <<<

/* Progetti Todoist */
const PROGETTO_TODO = "6hHmrPHvXCJqHhHC";                  // "To Do List"
const PROGETTO_NOTE = "6hHp8PVv3GGJv7ch";                  // progetto "Note"

/* Nomi ammessi nelle viste: la TO DO LIST non e' in questo elenco,
   quindi i suoi impegni non compaiono nelle griglie mensili. */
const NOMI_CALENDARI = CALENDARI.map((c) => c.name);

/* Legenda: e' una STRINGA HTML calcolata una volta sola al caricamento
   del config, non una funzione passata al modulo. Viene mostrata da un
   modulo helloworld dedicato e posizionata dal custom.css in alto a
   destra del calendario grande.
   Nota: in precedenza la legenda era generata da customHeader come
   funzione, ma quella configurazione veniva applicata anche alla seconda
   istanza del calendario e mandava in errore il disegno del modulo. */
const LEGENDA_HTML =
	'<div class="calendar-legend">' +
	CALENDARI.map((c) => {
		/* i calendari mostrati a bordo nel calendario (turni, festivita')
		   hanno il quadratino vuoto con il contorno colorato, cosi' la
		   legenda richiama l'aspetto dell'evento */
		const stile = c.soloBordo
			? `background:transparent;border:2px solid ${c.color}`
			: `background:${c.color}`;
		return `<span class="legend-item"><span class="legend-dot" style="${stile}"></span>${c.label}</span>`;
	}).join("") +
	"</div>";

/* Evidenziazione del mese mostrato dal calendario piccolo.

   Il modulo NON chiama manipulateDateCell sulle celle senza eventi
   (verificato in console: le celle hanno month_9 / year_2026 ma nessuna
   classe aggiunta da noi), quindi la marcatura da codice non e' una
   strada praticabile.

   Le celle hanno pero' gia' le classi month_N e year_N: qui generiamo
   un blocco <style> con i numeri del mese successivo, calcolati al
   caricamento della pagina. Le celle sono spente per default e solo
   quelle del mese mostrato vengono accese.

   Nota: i numeri sono fissati al caricamento. Al cambio di mese la
   dashboard va ricaricata perche' l'evidenziazione si sposti. */
const STILE_MESE_SUCCESSIVO = (() => {
	const oggi = new Date();
	// gestisce il passaggio dicembre -> gennaio
	const target = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 1);

	const sel = `.CX3_smallCalendar .cell.month_${target.getMonth() + 1}.year_${target.getFullYear()}`;

	return `<style>
/* default: tutte le celle spente */
.CX3_smallCalendar .cell { background: rgba(0, 0, 0, .45) !important; }
.CX3_smallCalendar .cell .cellDate { color: rgba(255, 255, 255, .22) !important; }

/* celle del mese mostrato: accese */
${sel} { background: transparent !important; }
${sel} .cellDate { color: rgba(255, 255, 255, .92) !important; }

/* sabato e domenica del mese mostrato */
${sel}[class*="weekday_0"] .cellDate,
${sel}[class*="weekday_6"] .cellDate { color: var(--weekend-color) !important; }

/* festivita': dopo il weekend, per prevalere a pari specificita' */
${sel}.holiday .cellDate { color: var(--holiday-color) !important; }
</style>`;
})();

/* Marca le celle che contengono una festivita': il custom.css usa la
   classe .holiday per colorare di rosso il numero del giorno.
   Funziona perche' queste celle contengono eventi. */
const marcaFestivita = (cellDom, events) => {
	if (
		Array.isArray(events) &&
		events.some((ev) => ev.calendarName === "festivita")
	) {
		cellDom.classList.add("holiday");
	}
};

let config = {
	address: "0.0.0.0",
	port: 10000,
	basePath: "/",
	ipWhitelist: [],

	useHttps: false,
	httpsPrivateKey: "",
	httpsCertificate: "",

	language: "it",
	locale: "it-IT",

	logLevel: ["INFO", "LOG", "WARN", "ERROR"],
	timeFormat: 24,
	units: "metric",

	modules: [
		{
			module: "alert"
		},

		/* ======================================================
		   OROLOGIO (colonna destra)
		   ====================================================== */
		{
			module: "clock",
			position: "top_right",
			classes: "main-clock",
			config: {
				displaySeconds: true,
				showDate: true,
				dateFormat: "dddd, D MMMM YYYY"
			}
		},

		/* ======================================================
		   METEO
		   ====================================================== */
		{
			module: "weather",
			position: "bottom_left",
			classes: "weather-current-box",
			header: "Meteo Villafranca di Verona",
			config: {
				weatherProvider: "openmeteo",
				type: "current",
				/* Il ", IT-34" veniva dal nome localita' restituito dal
				   servizio, che il modulo accoda all'intestazione. Qui
				   disattiviamo l'accodamento e scriviamo il titolo per
				   intero nel campo header qui sopra. */
				appendLocationNameToHeader: false,
				lat: 45.3526,
				lon: 10.8445
			}
		},

		{
			module: "weather",
			position: "bottom_center",
			classes: "weather-forecast-box",
			header: "Previsioni Villafranca di Verona",
			config: {
				weatherProvider: "openmeteo",
				type: "forecast",
				appendLocationNameToHeader: false,
				lat: 45.3526,
				lon: 10.8445,
				maxNumberOfDays: 5
			}
		},

		/* ======================================================
		   FEEDER EVENTI
		   Questo modulo NON si vede (nascosto da .calendar-feeder nel
		   custom.css): scarica gli eventi e li trasmette alle due
		   istanze di MMM-CalendarExt3, che da sole non scaricano nulla.
		   ====================================================== */
		{
			module: "calendar",
			position: "top_left",
			classes: "calendar-feeder",
			config: {
				broadcastPastEvents: true,   // senza questo i giorni passati del mese restano vuoti
				maximumEntries: 400,         // 7 calendari + eventi passati: serve spazio abbondante
				maximumNumberOfDays: 120,
				fetchInterval: 300000,
				calendars: CALENDARI.map((c) => ({
					url: c.url,
					name: c.name,
					color: c.color,
					symbol: c.symbol
				}))
			}
		},

		/* ======================================================
		   CALENDARIO MENSILE GRANDE (mese corrente)
		   ====================================================== */
		{
			module: "MMM-CalendarExt3",
			position: "top_left",
			classes: "main-month-calendar",
			config: {
				mode: "month",
				instanceId: "basicCalendar",
				locale: "it-IT",
				monthIndex: 0,                  // 0 = mese corrente
				firstDayOfWeek: 1,              // settimana da lunedi
				maxEventLines: 4,
				fontSize: "16px",
				eventHeight: "20px",
				useSymbol: false,               // niente icone negli eventi
				useIconify: false,              // usa le icone Font Awesome dei symbol
				showWeekNumber: false,          // niente "CW 34" a lato
				useWeather: false,              // niente icone meteo dentro le caselle
				customHeader: true,
				headerTitleOptions: { month: "long", year: "numeric" },
				calendarSet: NOMI_CALENDARI,
				manipulateDateCell: marcaFestivita
			}
		},

		/* ======================================================
		   LEGENDA DEI CALENDARI
		   Modulo a se' stante: il custom.css lo posiziona in alto a
		   destra sopra il calendario grande, in modo che il nome del
		   mese resti a sinistra e la legenda a destra.
		   ====================================================== */
		{
			module: "helloworld",
			position: "top_left",
			classes: "calendar-legend-box",
			config: {
				text: LEGENDA_HTML + STILE_MESE_SUCCESSIVO
			}
		},

		/* ======================================================
		   TO DO LIST (colonna destra)
		   Todoist: le attivita' restano visibili finche' non le
		   spunti dall'app, anche senza data. Sostituisce il vecchio
		   calendario Google, dove gli impegni scomparivano al
		   passare della data.
		   Sulla bacheca la lista e' in sola lettura: si spunta
		   dall'app sul telefono.
		   ====================================================== */
		{
			module: "MMM-Todoist",
			position: "top_right",
			classes: "todo-list",
			header: "TO DO LIST",
			config: {
				accessToken: TODOIST_TOKEN,
				projects: [PROGETTO_TODO],

				maximumEntries: 8,
				updateInterval: 10 * 60 * 1000,   // ogni 10 minuti
				fade: false,
				showProject: false,               // un solo progetto: il nome e' superfluo
				hideWhenEmpty: false              // mostra l'intestazione anche a lista vuota
			}
		},

		/* ======================================================
		   NOTE (colonna destra) - solo il titolo
		   In top_right, sotto la TO DO LIST: la regione in basso
		   ancorava il blocco al fondo dello schermo, mentre qui il
		   contenuto scende dall'alto e la distanza si regola con
		   --notes-top-gap nel custom.css.
		   ====================================================== */
		{
			module: "helloworld",
			position: "top_right",
			classes: "family-message-box",
			config: {
				/* Ora contiene SOLO il titolo: i messaggi arrivano dal
				   modulo Todoist qui sotto, che non ha intestazione propria
				   e si presenta quindi come continuazione di questa. */
				text: `
					<div class="family-message">
						<div class="family-message-title">
							NOTE
						</div>
					</div>
				`
			}
		},

		/* ======================================================
		   NOTE - CONTENUTO DINAMICO
		   Seconda istanza di MMM-Todoist su un progetto dedicato.
		   Nessuna intestazione: il titolo e' quello del modulo qui
		   sopra, cosi' i due blocchi sembrano una sezione unica.
		   Senza casella di spunta e con il testo a capo, l'aspetto
		   e' quello dei paragrafi che c'erano prima.
		   ====================================================== */
		{
			module: "MMM-Todoist",
			position: "top_right",
			classes: "family-notes",
			config: {
				accessToken: TODOIST_TOKEN,
				projects: [PROGETTO_NOTE],
				maximumEntries: 5,
				updateInterval: 10 * 60 * 1000,
				fade: false,
				showProject: false,
				hideWhenEmpty: true,             // nessun messaggio: spazio libero

				/* Il modulo tronca i titoli lunghi con "..." dopo circa 25
				   caratteri: e' il valore predefinito ereditato dal modulo
				   calendario. Qui alziamo il limite e permettiamo il testo
				   su piu' righe, indispensabile per delle note. */
				maxTitleLength: 250,
				wrapEvents: true,
				maxTitleLines: 4
			}
		},

		/* ======================================================
		   CALENDARIO PICCOLO (mese successivo)
		   Seconda istanza dello stesso modulo: nessuna installazione
		   aggiuntiva, basta un instanceId diverso.
		   ====================================================== */
		{
			module: "MMM-CalendarExt3",
			position: "bottom_right",
			classes: "second-month-calendar",
			config: {
				mode: "month",
				instanceId: "smallCalendar",
				locale: "it-IT",
				monthIndex: 1,                  // 1 = mese successivo
				firstDayOfWeek: 1,
				maxEventLines: 1,
				fontSize: "11px",
				eventHeight: "13px",
				useSymbol: false,
				useIconify: false,
				showWeekNumber: false,
				useWeather: false,
				customHeader: true,             // qui solo il nome del mese, senza legenda
				headerTitleOptions: { month: "long", year: "numeric" },
				calendarSet: NOMI_CALENDARI,

				/* solo le festivita': l'evidenziazione del mese mostrato la
				   fa il blocco <style> generato sopra */
				manipulateDateCell: marcaFestivita
			}
		}
	]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }
