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
				broadcastPastEvents: true,   // indispensabile: senza, i giorni passati del mese restano vuoti
				maximumEntries: 200,         // gli eventi passati occupano slot: tienilo alto
				maximumNumberOfDays: 120,
				fetchInterval: 300000,
				calendars: [
					{
						url: "https://calendar.google.com/calendar/ical/rikyvr81%40gmail.com/private-091b2d1fdfaa0054cd0a15f4363f00bf/basic.ics",
						name: "personale",
						color: "#039BE5",
						symbol: "calendar-check"
					},
					{
						url: "https://calendar.google.com/calendar/ical/it.italian%23holiday%40group.v.calendar.google.com/public/basic.ics",
						name: "festivita",
						color: "#0B8043",
						symbol: "flag"
					}
				]
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
				useIconify: false,              // usa le icone Font Awesome dei symbol qui sopra
				showWeekNumber: false,          // niente "CW 34" a lato
				useWeather: false,              // niente icone meteo dentro le caselle
				customHeader: true,             // genera <h1 class="headerTitle"> col nome del mese
				headerTitleOptions: { month: "long", year: "numeric" },
				calendarSet: ["personale", "festivita"]   // esclude la TO DO LIST
			}
		},

		/* ======================================================
		   TO DO LIST (colonna destra)
		   ====================================================== */
		{
			module: "calendar",
			position: "top_right",
			classes: "todo-list",
			header: "TO DO LIST",
			config: {
				updateInterval: 300000,
				language: "it",
				timeFormat: "absolute",
				maximumEntries: 6,
				displaySymbol: true,
				fade: false,
				calendars: [
					{
						url: "https://calendar.google.com/calendar/ical/6bb24c0fb7ed698a938c7a81d953e53f82e361c0f061bf25daaff1616cb8fe2d%40group.calendar.google.com/private-0fd6a3516912f9807cdf5c47c1deccd0/basic.ics",
						symbol: "check-square",
						name: "todo",        // il nome serve a NON farla comparire nei calendari mensili
						title: "To-Do"
					}
				]
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
				customHeader: true,
				headerTitleOptions: { month: "long", year: "numeric" },
				calendarSet: ["personale", "festivita"]
			}
		}
	]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }
