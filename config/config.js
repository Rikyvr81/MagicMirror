/* ==========================================================
   CORREZIONE ORARIO DI ALBA E TRAMONTO

   Il modulo meteo mostra il tramonto due ore avanti: riceve il dato in
   tempo universale, gli somma lo scarto del fuso della localita', e poi
   il browser lo mostra in ora locale sommandolo di nuovo.
   Verificato: il dato grezzo di OpenWeatherMap convertito da' 20:18,
   la dashboard mostrava 22:15.

   Non esiste un'opzione per correggerlo, quindi lo sistemiamo dopo il
   disegno. Lo scarto NON e' scritto come "due ore" ma ricavato dal
   sistema: a fine ottobre, con il ritorno dell'ora solare, diventa
   automaticamente un'ora sola.

   La correzione agisce solo dentro .weather-current-box, quindi non puo'
   toccare l'orologio o altri orari della dashboard.
   ========================================================== */
if (typeof document !== "undefined") {
	const correggiOrari = () => {
		const riquadro = document.querySelector(".weather-current-box");
		if (!riquadro) return;

		const scarto = -new Date().getTimezoneOffset();   // 120 d'estate, 60 d'inverno

		riquadro.querySelectorAll("span, div").forEach((elemento) => {
			if (elemento.children.length) return;              // solo elementi finali
			if (elemento.dataset.oraCorretta === "1") return;  // gia' sistemato

			const pezzi = elemento.textContent.trim().match(/^(\d{1,2}):(\d{2})$/);
			if (!pezzi) return;

			let minuti = Number(pezzi[1]) * 60 + Number(pezzi[2]) - scarto;
			minuti = (minuti + 1440) % 1440;                   // resta dentro le 24 ore

			const ore = String(Math.floor(minuti / 60)).padStart(2, "0");
			const min = String(minuti % 60).padStart(2, "0");

			elemento.textContent = `${ore}:${min}`;
			elemento.dataset.oraCorretta = "1";
		});
	};

	document.addEventListener("DOMContentLoaded", correggiOrari);
	/* il modulo ridisegna a ogni aggiornamento, quindi si ricontrolla */
	setInterval(correggiOrari, 5000);
}

/* ==========================================================
   SFONDO A ROTAZIONE
   Cambia l'immagine di sfondo a intervalli regolari senza dover
   ricaricare la pagina, pescando a caso tra le sorgenti elencate qui
   sotto. Nessuna richiede registrazione o chiave.

   Funziona perche' MagicMirror serve config.js al browser come script:
   il codice qui dentro viene eseguito nella pagina. La guardia su
   "document" e' necessaria perche' lo stesso file viene letto anche da
   Node sul server, dove document non esiste.

   L'immagine viene prima scaricata in memoria e sostituita solo a
   caricamento completato: senza questo accorgimento si vedrebbe un
   lampo di sfondo vuoto a ogni cambio. Se una sorgente non risponde si
   passa alla successiva, e in caso di fallimento totale resta
   l'immagine precedente invece di un fondo nero.
   ========================================================== */
const SFONDO_INTERVALLO = 30 * 60 * 1000;   // 30 minuti

/* Per togliere una categoria basta commentarne la riga.
   - "json" significa che il servizio risponde con dei dati da cui va
     estratto l'indirizzo dell'immagine;
   - "diretto" che l'indirizzo E' GIA' l'immagine. */
const SFONDO_SORGENTI = [
	{
		nome: "gatti",
		tipo: "json",
		url: () => "https://api.thecatapi.com/v1/images/search",
		estrai: (dati) => (Array.isArray(dati) && dati[0] ? dati[0].url : null)
	},
	{
		nome: "cani",
		tipo: "json",
		url: () => "https://api.thedogapi.com/v1/images/search",
		estrai: (dati) => (Array.isArray(dati) && dati[0] ? dati[0].url : null)
	},
	{
		nome: "natura",
		tipo: "diretto",
		/* il parametro finale serve solo a forzare un'immagine diversa a
		   ogni giro, altrimenti il browser riuserebbe quella in cache */
		url: () => `https://loremflickr.com/1920/1080/nature,forest,mountain,lake/all?lock=${Date.now()}`
	},
	{
		nome: "paesaggi casuali",
		tipo: "diretto",
		url: () => `https://picsum.photos/1920/1080?t=${Date.now()}`
	}
];

if (typeof document !== "undefined") {
	const applica = (indirizzo) =>
		new Promise((risolvi, rifiuta) => {
			const pre = new Image();
			pre.onload = () => {
				document.documentElement.style.backgroundImage = `url("${indirizzo}")`;
				risolvi();
			};
			pre.onerror = () => rifiuta(new Error("immagine non caricata"));
			pre.src = indirizzo;
		});

	const provaSorgente = async (sorgente) => {
		if (sorgente.tipo === "json") {
			const risposta = await fetch(sorgente.url());
			const dati = await risposta.json();
			const indirizzo = sorgente.estrai(dati);
			if (!indirizzo) throw new Error("nessun indirizzo nei dati");
			return applica(indirizzo);
		}
		return applica(sorgente.url());
	};

	const cambiaSfondo = async () => {
		/* si parte da una sorgente casuale e, se non risponde, si prosegue
		   in ordine con le altre: un servizio momentaneamente giu' non
		   lascia lo schermo vuoto */
		const partenza = Math.floor(Math.random() * SFONDO_SORGENTI.length);

		for (let i = 0; i < SFONDO_SORGENTI.length; i++) {
			const sorgente = SFONDO_SORGENTI[(partenza + i) % SFONDO_SORGENTI.length];
			try {
				await provaSorgente(sorgente);
				return;
			} catch (e) {
				/* si passa alla sorgente successiva */
			}
		}
	};

	/* Si chiama subito, senza attendere DOMContentLoaded: MagicMirror
	   carica il config DOPO che quell'evento e' passato, quindi un
	   ascoltatore non scatterebbe mai e il primo cambio arriverebbe solo
	   dopo mezz'ora. Nel frattempo si vedeva sempre la stessa immagine,
	   quella scritta nel custom.css, ripescata dalla cache.
	   Agiamo su documentElement, che esiste da subito: non serve
	   aspettare che il resto della pagina sia pronto. */
	cambiaSfondo();
	setInterval(cambiaSfondo, SFONDO_INTERVALLO);
}

/* ==========================================================
   COSTO DELL'ENERGIA NELL'ARCO DELLA GIORNATA

   Mostra, per le 24 ore di OGGI, quali sono le ore a costo
   basso, medio e alto, e qual e' la finestra migliore in cui
   concentrare i consumi.

   PERCHE' I DATI DI OGGI SONO GIA' NOTI STAMATTINA
   Il prezzo dell'energia si forma in un'asta che si chiude il
   giorno prima verso le 13:00: alle 13 di ieri erano gia'
   fissate tutte le 24 ore di oggi. Non e' quindi un dato
   storico, ma il prezzo effettivo delle ore che devono ancora
   arrivare. Dalle 13:00 di oggi sono disponibili anche le ore
   di domani (vedi ENERGIA_GIORNO qui sotto).

   PERCHE' QUESTA FONTE E NON IL GME
   Questo codice viene eseguito dal BROWSER, non da Node: puo'
   quindi chiamare solo servizi che accettano richieste da un
   altro dominio. L'archivio ufficiale del GME non lo fa e
   richiederebbe un modulo con node_helper lato server.
   api.energy-charts.info (Fraunhofer ISE) non chiede alcuna
   registrazione, risponde in JSON e accetta le richieste dal
   browser.

   ATTENZIONE AL SIGNIFICATO DEL NUMERO
   La zona IT-NORTH e' il prezzo ZONALE del nord Italia, che non
   coincide col PUN nazionale mostrato dall'app del fornitore:
   sono vicini ma non identici, quindi la media in euro puo'
   scostarsi di qualche millesimo. La suddivisione in fasce, che
   e' la parte utile, resta corretta.
   E' comunque il prezzo all'INGROSSO: la bolletta ci aggiunge
   spread del fornitore, oneri, trasporto e IVA. Serve a dire
   QUANDO conviene consumare, non quanto si paghera'.
   ========================================================== */

/* Zona di offerta. Villafranca di Verona sta nel nord. */
const ENERGIA_ZONA = "IT-NORTH";

/* Ogni quanto si ricontrolla il prezzo. I dati del giorno non
   cambiano piu' una volta pubblicati, quindi un giro all'ora e'
   abbondante: serve solo a intercettare il cambio di giornata. */
const ENERGIA_AGGIORNAMENTO = 60 * 60 * 1000;

/* Quanto dura la "fascia migliore" cercata, in ore. A 3 e' la
   stessa finestra che usa l'app del fornitore. Alzalo a 4 o 5 se
   ti interessa un intervallo piu' lungo in cui far partire piu'
   elettrodomestici. */
const ENERGIA_FINESTRA = 3;

/* 0 = oggi, 1 = domani. Domani e' disponibile solo dopo le 13:00
   circa: prima di quell'ora il pannello resterebbe in attesa. */
const ENERGIA_GIORNO = 0;

if (typeof document !== "undefined") {
	/* Data in formato AAAA-MM-GG costruita sui campi LOCALI.
	   toISOString() non va bene: converte in tempo universale e
	   d'estate, dopo le 22:00, restituirebbe il giorno dopo. */
	const dataLocale = (d) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

	const oraDue = (h) => `${String(h).padStart(2, "0")}:00`;

	const euro = (v) =>
		v.toLocaleString("it-IT", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

	/* ------------------------------------------------------
	   SCARICO E RIDUZIONE A 24 ORE
	   Il servizio puo' rispondere sia a passo orario sia a passo
	   di 15 minuti, a seconda della zona e del periodo. Invece di
	   dare per scontato il passo, raggruppiamo per ora locale e
	   facciamo la media: il codice funziona in entrambi i casi e
	   non si rompe se il mercato cambia granularita'.
	   ------------------------------------------------------ */
	const scaricaPrezzi = async () => {
		const base = new Date();
		const giorno = new Date(base.getFullYear(), base.getMonth(), base.getDate() + ENERGIA_GIORNO);
		const giornoDopo = new Date(giorno.getFullYear(), giorno.getMonth(), giorno.getDate() + 1);

		const url =
			`https://api.energy-charts.info/price?bzn=${ENERGIA_ZONA}` +
			`&start=${dataLocale(giorno)}&end=${dataLocale(giornoDopo)}`;

		const risposta = await fetch(url);
		if (!risposta.ok) throw new Error(`risposta ${risposta.status}`);

		const dati = await risposta.json();

		/* il campo dei valori ha cambiato nome nel tempo: li
		   accettiamo entrambi invece di inseguire la versione */
		const valori = dati.price || dati.data || [];
		const istanti = dati.unix_seconds || [];
		if (!istanti.length) throw new Error("nessun dato");

		const somma = new Array(24).fill(0);
		const conta = new Array(24).fill(0);
		const etichetta = dataLocale(giorno);

		istanti.forEach((secondi, i) => {
			const valore = valori[i];
			if (valore === null || valore === undefined) return;

			const istante = new Date(secondi * 1000);
			/* il servizio puo' restituire anche code del giorno
			   prima o dopo: teniamo solo il giorno che ci interessa */
			if (dataLocale(istante) !== etichetta) return;

			somma[istante.getHours()] += valore;
			conta[istante.getHours()]++;
		});

		/* da EUR/MWh a euro al kWh: diviso mille */
		const ore = somma.map((s, h) => (conta[h] ? s / conta[h] / 1000 : null));

		if (ore.every((v) => v === null)) throw new Error("giorno non ancora pubblicato");
		return ore;
	};

	/* ------------------------------------------------------
	   FASCE
	   Le tre fasce non hanno soglie fisse in euro: sarebbero
	   inutili, perche' una giornata cara avrebbe TUTTE le ore
	   sopra soglia e si colorerebbe di rosso per intero.
	   Dividiamo invece le 24 ore della giornata in tre gruppi da
	   otto: le otto piu' economiche, le otto intermedie, le otto
	   piu' care. La lettura resta sempre relativa alla giornata,
	   che e' quello che serve per decidere quando accendere la
	   lavastoviglie.
	   ------------------------------------------------------ */
	const calcolaFasce = (ore) => {
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
	};

	/* Finestra continua di ENERGIA_FINESTRA ore con la media piu'
	   bassa. Si scorre l'intera giornata, comprese le ore gia'
	   passate: se il momento migliore era stamattina e' bene
	   saperlo, invece di vedersi proporre il meno peggio di
	   quello che resta. */
	const miglioreFinestra = (ore) => {
		let migliore = null;

		for (let h = 0; h + ENERGIA_FINESTRA <= 24; h++) {
			const fetta = ore.slice(h, h + ENERGIA_FINESTRA);
			if (fetta.some((v) => v === null)) continue;

			const media = fetta.reduce((a, b) => a + b, 0) / ENERGIA_FINESTRA;
			if (!migliore || media < migliore.media) migliore = { ora: h, media };
		}

		return migliore;
	};

	/* ------------------------------------------------------
	   DISEGNO
	   ------------------------------------------------------ */
	const disegnaEnergia = (ore) => {
		const pannello = document.querySelector(".energy-panel");
		if (!pannello) return;

		if (!ore) {
			pannello.innerHTML = '<div class="energy-avviso">Prezzi non disponibili</div>';
			return;
		}

		const fasce = calcolaFasce(ore);
		const migliore = miglioreFinestra(ore);
		const validi = ore.filter((v) => v !== null);
		const media = validi.reduce((a, b) => a + b, 0) / validi.length;
		const adesso = ENERGIA_GIORNO === 0 ? new Date().getHours() : -1;

		const barre = fasce
			.map((f, h) => {
				const classi = ["energy-seg"];
				if (f) classi.push(`energy-${f}`);
				if (h === adesso) classi.push("energy-adesso");
				return `<span class="${classi.join(" ")}"></span>`;
			})
			.join("");

		const testaMigliore = migliore
			? `<span class="energy-best-hours">${oraDue(migliore.ora)} &ndash; ${oraDue(migliore.ora + ENERGIA_FINESTRA)}</span>
			   <span class="energy-best-avg">${euro(migliore.media)} &euro;/kWh</span>`
			: '<span class="energy-best-hours">&mdash;</span>';

		pannello.innerHTML = `
			<div class="energy-best">${testaMigliore}</div>
			<div class="energy-bar">${barre}</div>
			<div class="energy-ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
			<div class="energy-foot">
				<span class="energy-media-testo">Media ${euro(media)} &euro;/kWh</span>
				<span class="energy-legend">
					<i class="energy-bassa"></i>bassa<i class="energy-media-dot"></i>media<i class="energy-alta"></i>alta
				</span>
			</div>
		`;
	};

	/* ------------------------------------------------------
	   CICLO
	   Gira ogni minuto ma scarica solo una volta all'ora: il giro
	   frequente serve a spostare il segnalino dell'ora corrente e
	   a ridisegnare quando il modulo compare nel DOM, cosa che
	   avviene dopo l'esecuzione di questo file.
	   ------------------------------------------------------ */
	let prezziEnergia = null;
	let ultimoScaricoEnergia = 0;

	const cicloEnergia = async () => {
		if (!document.querySelector(".energy-panel")) return;

		if (!prezziEnergia || Date.now() - ultimoScaricoEnergia > ENERGIA_AGGIORNAMENTO) {
			try {
				prezziEnergia = await scaricaPrezzi();
				ultimoScaricoEnergia = Date.now();
			} catch (e) {
				/* si tiene l'ultimo dato buono e si riprova al giro
				   successivo: meglio un prezzo di un'ora fa che un
				   riquadro vuoto */
				if (!prezziEnergia) ultimoScaricoEnergia = 0;
			}
		}

		disegnaEnergia(prezziEnergia);
	};

	cicloEnergia();
	setInterval(cicloEnergia, 60 * 1000);
}

/* ==========================================================
   FAMILY HUB - config della versione stabile del 19 agosto 2026
   Da usare in coppia con il custom.css di pari data: i valori
   maxEventLines / fontSize / eventHeight dei due calendari sono
   coordinati con le variabili del foglio di stile.
   ========================================================== */

/* Osservanze da NON mostrare: il calendario "Festivita' in Italia" di
   Google contiene sia le feste civili sia le ricorrenze religiose e
   popolari. Qui teniamo le sole festivita' nazionali (Capodanno,
   Epifania, Pasqua e Pasquetta, Liberazione, Primo Maggio, Repubblica,
   Ferragosto, Ognissanti, Immacolata, Natale, Santo Stefano) ed
   escludiamo il resto.

   "Assunzione" e' esclusa perche' duplica Ferragosto: sono lo stesso
   giorno, una come ricorrenza religiosa e una come festa civile. Se
   preferisci il nome religioso, scambia le due voci.

   E' un elenco per esclusione: se nel corso dell'anno vedessi comparire
   un'osservanza che non ti interessa, basta aggiungerne il nome qui. */
const OSSERVANZE_ESCLUSE = [
	"Assunzione",
	"Vigilia di Natale",
	"Vigilia di Capodanno",
	"San Silvestro",
	"Commemorazione dei defunti",
	"Giorno della Memoria",
	"Giorno del Ricordo",
	"San Valentino",
	"San Giuseppe",
	"Carnevale",
	"Martedì grasso",
	"Mercoledì delle Ceneri",
	"Domenica delle Palme",
	"Giovedì santo",
	"Venerdì santo",
	"Sabato santo",
	"Ascensione",
	"Pentecoste",
	"Corpus Domini",
	"Halloween",
	"Unità nazionale",
	"Forze Armate",

	/* Ricorrenze dei santi: sono osservanze, non giorni festivi.
	   I tre filtri coprono in un colpo tutti i patroni che Google
	   inserisce nel corso dell'anno (San Francesco il 4 ottobre,
	   Sant'Ambrogio il 7 dicembre e simili) senza doverli elencare.
	   Nota il dettaglio che li rende sicuri: "San " ha lo spazio finale,
	   quindi NON intercetta "Santo Stefano", che e' festivita' nazionale
	   e resta visibile. Lo stesso vale per "Ognissanti". */
	"San ",
	"Santa ",
	"Sant'"
];

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
		url: "https://calendar.google.com/calendar/ical/it.italian%23holiday%40group.v.calendar.google.com/public/basic.ics",
		/* solo le festivita' nazionali: vedi OSSERVANZE_ESCLUSE sopra */
		excludedEvents: OSSERVANZE_ESCLUSE
	}
];

/* ==========================================================
   CREDENZIALI
   Le due costanti qui sotto sono l'unico punto da compilare, e sono
   usate da tutti i moduli che ne hanno bisogno: i due meteo leggono
   OWM_KEY, la TO DO LIST e le NOTE leggono TODOIST_TOKEN.

   Nota per il futuro: abbiamo provato a spostarle in un file separato
   (config/segreti.json) per non doverle reinserire a ogni sostituzione
   del config, ma non ha funzionato. Il file era servito correttamente e
   la richiesta funzionava dalla console, mentre i valori arrivavano
   vuoti ai moduli: il config viene evidentemente valutato in un
   contesto in cui nessuna delle vie tentate era percorribile.
   Se un domani ci si riprova, il punto da chiarire per primo e' DOVE
   viene eseguito questo file.
   ========================================================== */

/* Todoist -> Impostazioni -> Integrazioni -> Sviluppatore -> API token */
const TODOIST_TOKEN = "b5165897484eaae9d7d53d4f5d6378886a331bb5";

/* openweathermap.org -> profilo -> API keys (piano gratuito, API 2.5).
   Una chiave appena creata richiede fino a due ore per attivarsi: nel
   frattempo il meteo resta su "Caricamento in corso". */
const OWM_KEY = "4bd3e85d4cb8457cd3d0bf6f0e6a68aa";

/* Progetti Todoist */
const PROGETTO_TODO = "6hHmrPHvXCJqHhHC";                  // "To Do List"
const PROGETTO_NOTE = "6hHp8PVv3GGJv7ch";                  // progetto "Note"

/* Ordine con cui gli eventi si dispongono dentro la cella del giorno:
   valore piu' basso = piu' in alto. Il modulo dispone gli eventi
   "a incastro" per riempire lo spazio, quindi in presenza di eventi di
   piu' giorni l'ordine puo' non essere rispettato alla lettera. */
const ORDINE_EVENTI = ["turni", "festivita", "varie", "riky", "elisa", "greta", "edo"];

const ordinaEventi = (a, b) => {
	const pos = (ev) => {
		const i = ORDINE_EVENTI.indexOf(ev.calendarName);
		return i === -1 ? 99 : i;      // calendari non elencati vanno in fondo
	};
	return pos(a) - pos(b);
};

/* Legenda su due righe, allineate a destra. Il primo gruppo sono le
   persone, il secondo i calendari di contesto. Per spostare una voce
   da una riga all'altra basta cambiarla di gruppo qui sotto. */
const LEGENDA_RIGHE = [
	["riky", "elisa", "greta", "edo"],
	["varie", "turni", "festivita"]
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
	LEGENDA_RIGHE.map((riga) =>
		'<div class="legend-row">' +
		riga.map((nome) => {
			const c = CALENDARI.find((x) => x.name === nome);
			if (!c) return "";
			/* i calendari mostrati a bordo nel calendario (turni, festivita')
			   hanno il quadratino vuoto con il contorno colorato, cosi' la
			   legenda richiama l'aspetto dell'evento */
			const stile = c.soloBordo
				? `background:transparent;border:2px solid ${c.color}`
				: `background:${c.color}`;
			return `<span class="legend-item"><span class="legend-dot" style="${stile}"></span>${c.label}</span>`;
		}).join("") +
		"</div>"
	).join("") +
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

	/* I colori arrivano dalle variabili del custom.css invece di essere
	   scritti qui: cosi' i giorni fuori dal mese si regolano da un punto
	   solo per entrambi i calendari. Essendo iniettato nel DOM, questo
	   stile vince sul foglio esterno, quindi con valori fissi non
	   sarebbe modificabile dal CSS. */
	return `<style>
/* default: tutte le celle spente */
.CX3_smallCalendar .cell { background: var(--outmonth-bg) !important; }
.CX3_smallCalendar .cell .cellDate { color: var(--outmonth-text) !important; }

/* celle del mese mostrato: accese */
${sel} { background: transparent !important; }
${sel} .cellDate { color: var(--inmonth-text) !important; }

/* sabato e domenica del mese mostrato: numero blu e fondo azzurrino.
   Le celle dei mesi adiacenti non sono toccate, perche' il selettore
   include il mese e l'anno visualizzati. */
${sel}[class*="weekday_0"] .cellDate,
${sel}[class*="weekday_6"] .cellDate { color: var(--weekend-color) !important; }
${sel}[class*="weekday_0"],
${sel}[class*="weekday_6"] { background: var(--weekend-bg) !important; }

/* festivita': dopo il weekend, per prevalere a pari specificita' */
${sel}.holiday .cellDate { color: var(--holiday-color) !important; font-weight: 700 !important; }
</style>`;
})();

/* Marca gli eventi che cadono FUORI dal mese corrente, cosi' il CSS puo'
   sbiadirli come gli impegni passati.
   Serve un passaggio dal config perche' nel DOM gli eventi non stanno
   dentro le celle ma in un contenitore a livello della settimana, e le
   loro classi non contengono la data: dal solo CSS non c'e' modo di
   sapere a che giorno appartengono.
   La classe assegnata con ev.class viene applicata dal modulo
   all'elemento dell'evento. */
const marcaFuoriMese = (ev) => {
	const oggi = new Date();
	const inizioMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1).valueOf();
	const inizioMeseDopo = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 1).valueOf();

	/* startDate e' gia' un timestamp quando il modulo ha regolarizzato
	   l'evento; in caso contrario lo ricaviamo dai campi originali. */
	const inizio =
		typeof ev.startDate === "number"
			? ev.startDate
			: new Date(ev.startDate || ev.start?.date || ev.start?.dateTime).valueOf();

	if (!Number.isNaN(inizio) && (inizio < inizioMese || inizio >= inizioMeseDopo)) {
		ev.class = "fuoriMese";
	}

	return ev;
};

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
			position: "top_right",
			classes: "weather-current-box",
			header: "Meteo Villafranca di Verona",
			config: {
				weatherProvider: "openweathermap",
				apiKey: OWM_KEY,
				/* apiVersion e weatherEndpoint dichiarati esplicitamente:
				   OpenWeatherMap ha piu' indirizzi e non tutti sono
				   accessibili col piano gratuito. Questi due sono quelli
				   della API 2.5 gratuita, verificati a mano con esito 200. */
				apiVersion: "2.5",
				weatherEndpoint: "/weather",
				updateInterval: 30 * 60 * 1000,   // mezz'ora: la quota e' limitata
				type: "current",
				showFeelsLike: true,         // percepita in piccolo, sotto vento e tramonto
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
			position: "top_right",
			classes: "weather-forecast-box",
			header: "Previsioni Villafranca di Verona",
			config: {
				weatherProvider: "openweathermap",
				apiKey: OWM_KEY,
				/* /forecast e' l'endpoint gratuito a intervalli di 3 ore, da
				   cui il modulo ricava i giorni. NON /forecast/daily, che
				   richiede un piano a pagamento e risponde 401: e' la causa
				   piu' probabile del blocco su "Caricamento in corso". */
				apiVersion: "2.5",
				weatherEndpoint: "/forecast",
				updateInterval: 30 * 60 * 1000,   // mezz'ora
				type: "forecast",
				/* nome del giorno per esteso invece dell'abbreviazione:
				   "venerdi'" al posto di "ven". Il predefinito e' "ddd".
				   Oggi e domani restano tali: quelle due voci il modulo le
				   traduce a parte, non le formatta come data. */
				forecastDateFormat: "dddd",
				appendLocationNameToHeader: false,
				lat: 45.3526,
				lon: 10.8445,
				maxNumberOfDays: 4        // oggi, domani e due giorni
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
				fetchInterval: 10 * 60 * 1000,   // 10 minuti, come le liste Todoist
				/* Qui si copiano solo i campi che il modulo calendar
				   conosce. Attenzione: ogni nuova proprieta' aggiunta
				   all'elenco CALENDARI va riportata anche qui, altrimenti
				   viene semplicemente ignorata. */
				calendars: CALENDARI.map((c) => ({
					url: c.url,
					name: c.name,
					color: c.color,
					symbol: c.symbol,
					...(c.excludedEvents ? { excludedEvents: c.excludedEvents } : {})
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
				/* Tarati per riempire l'altezza a schermo intero (1080px):
				   altezza cella = cellheaderheight + maxEventLines x eventHeight.
				   Con 5 righe da 24px le sei settimane occupano ~900px. */
				/* 4 righe da 30px invece di 5 da 25: la cella resta alta
				   uguale (30 + 4x30 = 150) ma ogni evento ha 5px in piu'
				   di respiro, che servono al testo a 24px. */
				maxEventLines: 4,
				fontSize: "24px",
				eventHeight: "30px",
				useSymbol: false,               // niente icone negli eventi
				useIconify: false,              // usa le icone Font Awesome dei symbol
				showWeekNumber: false,          // niente "CW 34" a lato
				useWeather: false,              // niente icone meteo dentro le caselle
				customHeader: true,
				headerTitleOptions: { month: "long", year: "numeric" },
				calendarSet: NOMI_CALENDARI,
				eventSorter: ordinaEventi,
				eventTransformer: marcaFuoriMese,
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
		   COSTO ENERGIA (colonna destra, tra NOTE e SETTEMBRE)
		   Il riquadro e' vuoto: lo riempie il blocco "COSTO
		   DELL'ENERGIA" in cima a questo file, che scarica i
		   prezzi e disegna dentro .energy-panel.
		   La posizione nella colonna dipende dall'ordine in
		   questo array: spostando il blocco piu' su o piu' giu'
		   si sposta anche il riquadro.
		   ====================================================== */
		{
			module: "helloworld",
			position: "top_right",
			classes: "energy-box",
			config: {
				text: `
					<div class="energy-block">
						<div class="energy-header">COSTO ENERGIA OGGI</div>
						<div class="energy-panel">
							<div class="energy-avviso">Caricamento in corso</div>
						</div>
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
				/* 2 righe da 20px con celle piu' alte: il calendario cresce
				   verso l'alto di circa 160px, e in una cella entrano due
				   eventi invece di uno. */
				maxEventLines: 2,
				fontSize: "16px",
				eventHeight: "20px",
				useSymbol: false,
				useIconify: false,
				showWeekNumber: false,
				useWeather: false,
				customHeader: true,             // qui solo il nome del mese, senza legenda
				headerTitleOptions: { month: "long", year: "numeric" },
				calendarSet: NOMI_CALENDARI,
				eventSorter: ordinaEventi,

				/* solo le festivita': l'evidenziazione del mese mostrato la
				   fa il blocco <style> generato sopra */
				manipulateDateCell: marcaFestivita
			}
		}
	]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }
