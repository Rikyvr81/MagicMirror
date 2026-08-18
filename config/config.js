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
		color: "#26C6DA",          // ciano - reso a BORDO (vedi custom.css)
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
		color: "#4CAF50",          // verde - reso a BORDO (vedi custom.css)
		soloBordo: true,
		symbol: "flag",
		url: "https://calendar.google.com/calendar/ical/it.italian%23holiday%40group.v.calendar.google.com/public/basic.ics"
	}
];

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
			header: "Meteo",
			config: {
				weatherProvider: "openmeteo",
				type: "current",
				lat: 45.3526,
				lon: 10.8445
			}
		},

		{
			module: "weather",
			position: "bottom_center",
			classes: "weather-forecast-box",
			header: "Previsioni",
			config: {
				weatherProvider: "openmeteo",
				type: "forecast",
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
				useSymbol: true,
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
				accessToken: "51043a285f4e89fc87306fb1ab5f62380c6b2856",

				projects: ["6hHmrPHvXCJqHhHC"],   // progetto "To Do List"

				maximumEntries: 8,
				updateInterval: 10 * 60 * 1000,   // ogni 10 minuti
				fade: false,
				showProject: false,               // un solo progetto: il nome e' superfluo
				hideWhenEmpty: false              // mostra l'intestazione anche a lista vuota
			}
		},

		/* ======================================================
		   COMUNICAZIONI FAMIGLIA (colonna destra)
		   ====================================================== */
		{
			module: "helloworld",
			position: "bottom_right",
			classes: "family-message-box",
			config: {
				text: `
					<div class="family-message">
						<div class="family-message-title">
							COMUNICAZIONI FAMIGLIA
						</div>

						<p>
							Ricordarsi di verificare il materiale scolastico prima dell'inizio delle lezioni
							e controllare eventuali comunicazioni ricevute dalla scuola durante la settimana.
						</p>

						<p>
							Questa settimana è prevista la visita medica annuale.
							Verificare che tutta la documentazione necessaria sia disponibile e aggiornata.
						</p>
					</div>
				`
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
