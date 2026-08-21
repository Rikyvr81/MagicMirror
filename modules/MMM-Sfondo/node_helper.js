/* ==========================================================
   MMM-Sfondo - node_helper

   Sceglie la fotografia di sfondo. Gira in Node, sul server di
   Render, per una ragione sola: la chiave di Unsplash.

   PERCHE' NON NEL CONFIG.JS
   La rotazione degli sfondi stava in cima al config.js, che pero'
   viene eseguito dal BROWSER: qualunque chiave scritta li'
   finirebbe in chiaro nella pagina scaricata dalla TV e nel
   repository su GitHub. E' lo stesso motivo per cui la chiave
   dello Shelly non sta nel config.
   La chiave si legge da process.env, quindi va scritta su Render
   in Environment come UNSPLASH_ACCESS_KEY.

   COSA RESTITUISCE
   Solo l'indirizzo dell'immagine e il nome dell'autore. Il
   modulo, che gira nel browser, non sa nulla di chiavi e non
   potrebbe rifare la chiamata da solo.
   ========================================================== */

const NodeHelper = require("node_helper");

const UNSPLASH = "https://api.unsplash.com";
const DRIVE = "https://www.googleapis.com/drive/v3/files";

/* Indirizzo diretto della rete di distribuzione di Google.
   Verificato in navigazione anonima: l'indirizzo "thumbnail" di
   drive.google.com reindirizza qui, quindi si punta direttamente
   alla destinazione. Non richiede la chiave - che quindi non
   finisce nella pagina servita alla TV - e converte da sola i
   formati che il browser non sa leggere, HEIC compreso. */
const DRIVE_IMMAGINE = "https://lh3.googleusercontent.com/d/";

/* L'elenco dei file cambia solo quando aggiungi o togli foto:
   riscaricarlo a ogni cambio di sfondo sarebbe inutile. Sei ore
   sono un compromesso fra il non accorgersi delle novita' e il
   tempestare Google di richieste. */
const VALIDITA_ELENCO = 6 * 60 * 60 * 1000;

/* Larghezza a cui chiedere l'immagine. Unsplash serve indirizzi
   ridimensionabili al volo, e non ha senso scaricare un file da
   6000px per uno schermo da 1920: pesa dieci volte tanto e la
   TV ci mette altrettanto a mostrarlo.
   Si chiede qualcosa in piu' della larghezza dello schermo per
   avere margine sull'ingrandimento applicato dal custom.css. */
const LARGHEZZA = 2400;

const LUNGHEZZA_ERRORE = 180;

module.exports = NodeHelper.create({
	start: function () {
		console.log("MMM-Sfondo: helper avviato");
		/* elenco dei file del Drive, tenuto da parte */
		this.elenco = null;
		this.elencoQuando = 0;
	},

	/* ------------------------------------------------------
	   GOOGLE DRIVE

	   Legge una cartella condivisa "con chiunque abbia il link".
	   Serve solo una chiave API, non un accesso al tuo account:
	   e' la ragione per cui la cartella deve essere pubblica, e
	   il motivo per cui li' dentro vanno solo foto che non ti
	   dispiacerebbe far vedere a uno sconosciuto.
	   La chiave sta su Render come GDRIVE_API_KEY. Serve solo per
	   ELENCARE i file: le immagini si scaricano da un indirizzo
	   che non la richiede, quindi la chiave non arriva mai al
	   browser.
	   ------------------------------------------------------ */
	elencoDrive: async function (cartella) {
		if (this.elenco && Date.now() - this.elencoQuando < VALIDITA_ELENCO) {
			return this.elenco;
		}

		const chiave = process.env.GDRIVE_API_KEY;
		if (!chiave) throw new Error("GDRIVE_API_KEY non impostata su Render");
		if (!cartella) throw new Error("cartella Drive non indicata nel config");

		const url =
			`${DRIVE}?q=${encodeURIComponent(`'${cartella}' in parents and trashed = false`)}` +
			`&fields=${encodeURIComponent("files(id,name,mimeType)")}` +
			`&pageSize=1000&key=${encodeURIComponent(chiave)}`;

		const risposta = await fetch(url, { headers: { Accept: "application/json" } });
		const testo = await risposta.text();

		if (!risposta.ok) {
			throw new Error(`drive: ${risposta.status} ${testo.trim().slice(0, LUNGHEZZA_ERRORE)}`);
		}

		const dati = JSON.parse(testo);

		/* Si tengono solo le immagini: nella cartella potrebbe
		   finirci di tutto, e una cartella o un PDF messi come
		   sfondo darebbero uno schermo nero senza spiegazioni. */
		const foto = (dati.files || []).filter(
			(f) => typeof f.mimeType === "string" && f.mimeType.startsWith("image/")
		);

		if (!foto.length) throw new Error("nessuna immagine nella cartella");

		this.elenco = foto;
		this.elencoQuando = Date.now();
		console.log(`MMM-Sfondo: elenco Drive aggiornato, ${foto.length} immagini`);

		return foto;
	},

	daDrive: async function (carico) {
		const foto = await this.elencoDrive(carico && carico.cartella);
		const scelta = foto[Math.floor(Math.random() * foto.length)];

		return {
			immagine: `${DRIVE_IMMAGINE}${scelta.id}=w${LARGHEZZA}`,
			autore: "",
			profilo: "",
			fonte: "drive"
		};
	},

	socketNotificationReceived: function (avviso, carico) {
		if (avviso !== "SFONDO_CHIEDI") return;

		this.scegli(carico).catch((e) =>
			console.error("MMM-Sfondo: errore non gestito -", e && e.message)
		);
	},

	/* ------------------------------------------------------
	   SMISTAMENTO FRA LE DUE SORGENTI

	   modo 1 = solo Drive
	   modo 2 = entrambe, sorteggiate a ogni cambio
	   modo 3 = solo Unsplash

	   Nel modo 2 non c'e' una principale e una di riserva: si
	   tira a sorte ogni volta. E' una scelta migliore di quella
	   che avevo proposto io, perche' tiene vive entrambe le
	   strade - se il Drive smettesse di rispondere te ne
	   accorgeresti subito, vedendo solo fotografie di Unsplash,
	   invece di scoprirlo mesi dopo.
	   Quando una delle due fallisce si prova comunque l'altra
	   prima di arrendersi: uno sfondo c'e' sempre.
	   ------------------------------------------------------ */
	scegli: async function (carico) {
		const modo = (carico && carico.modo) || 2;

		let ordine;
		if (modo === 1) ordine = ["drive"];
		else if (modo === 3) ordine = ["unsplash"];
		else ordine = Math.random() < 0.5 ? ["drive", "unsplash"] : ["unsplash", "drive"];

		const problemi = [];

		for (const fonte of ordine) {
			try {
				const foto = fonte === "drive"
					? await this.daDrive(carico)
					: await this.daUnsplash(carico);

				this.sendSocketNotification("SFONDO_FOTO", foto);
				return;
			} catch (errore) {
				console.error(`MMM-Sfondo: ${fonte} -`, errore.message);
				problemi.push(`${fonte}: ${errore.message}`);
			}
		}

		this.sendSocketNotification("SFONDO_ERRORE", { messaggio: problemi.join(" / ") });
	},

	daUnsplash: async function (carico) {
		const chiave = process.env.UNSPLASH_ACCESS_KEY;
		if (!chiave) throw new Error("UNSPLASH_ACCESS_KEY non impostata su Render");

		/* Una parola di ricerca a caso fra quelle configurate: cosi'
		   i generi si alternano invece di esaurire prima uno e poi
		   l'altro. */
		const ricerche = (carico && carico.ricerche) || ["landscape"];
		const ricerca = ricerche[Math.floor(Math.random() * ricerche.length)];

		const url =
			`${UNSPLASH}/photos/random?query=${encodeURIComponent(ricerca)}` +
			`&orientation=landscape&content_filter=high`;

		{
			const risposta = await fetch(url, {
				headers: {
					Authorization: `Client-ID ${chiave}`,
					"Accept-Version": "v1"
				}
			});

			const testo = await risposta.text();
			if (!risposta.ok) {
				throw new Error(`${risposta.status} ${testo.trim().slice(0, LUNGHEZZA_ERRORE)}`);
			}

			const foto = JSON.parse(testo);
			const base = foto?.urls?.raw || foto?.urls?.full;
			if (!base) throw new Error("risposta senza indirizzo immagine");

			/* Gli indirizzi "raw" accettano parametri di
			   ridimensionamento in coda: si chiede la larghezza che
			   serve e una compressione ragionevole. */
			const immagine = `${base}&w=${LARGHEZZA}&q=80&fm=jpg&fit=max`;

			/* LE LINEE GUIDA CHIEDONO DI SEGNALARE L'USO
			   Quando una foto viene effettivamente mostrata, Unsplash
			   chiede di chiamare il suo indirizzo di download: serve
			   a far risultare la visualizzazione nelle statistiche
			   dell'autore. Non scarica nulla e non ci interessa
			   l'esito, quindi si lancia e si dimentica. */
			const traccia = foto?.links?.download_location;
			if (traccia) {
				fetch(traccia, { headers: { Authorization: `Client-ID ${chiave}` } })
					.catch(() => {});
			}

			console.log(`MMM-Sfondo: nuova foto Unsplash (${ricerca}) di ${foto?.user?.name || "ignoto"}`);

			return {
				immagine: immagine,
				autore: foto?.user?.name || "",
				profilo: foto?.user?.links?.html || "",
				fonte: "unsplash"
			};
		}
	}
});
