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
			position: "bottom_right",
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
		{
			module: "clock",
			position: "top_left",
			classes: "calendar-month-title",
			config: {
				showDate: true,
				dateFormat: "MMMM YYYY",
				displaySeconds: false
			}
		},
		{
			module: "helloworld",
			position: "top_left",
			classes: "main-google-calendar",
			config: {
				text: "<div class="family-calendar-frame"><iframe src='https://calendar.google.com/calendar/embed?src=rikyvr81@gmail.com&color=%23039BE5&src=it.italian%23holiday@group.v.calendar.google.com&color=%230B8043&ctz=Europe/Rome&showTitle=0&showNav=0&showDate=0&showPrint=0&showTabs=0&showCalendars=0&showTz=0' style='border:0' width='1000' height='700' frameborder='0' scrolling='no'></iframe></div>"
			}
		},
		{
			module: "calendar",
			position: "top_right",
			classes: "todo-list",
			header: "📋 TO DO LIST",
			config: {
				language: "it",
				timeFormat: "absolute",
				maximumEntries: 6, 
				displaySymbol: true,
				fade: false,
				calendars: [
					{
						url: "https://calendar.google.com/calendar/ical/6bb24c0fb7ed698a938c7a81d953e53f82e361c0f061bf25daaff1616cb8fe2d%40group.calendar.google.com/private-0fd6a3516912f9807cdf5c47c1deccd0/basic.ics",
						symbol: "check-square",
						title: "To-Do"
					}
				]
			}
		},
		
	]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }
