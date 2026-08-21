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
	},

	socketNotificationReceived: function (avviso, carico) {
		if (avviso !== "SFONDO_CHIEDI") return;

		this.scegli(carico).catch((e) =>
			console.error("MMM-Sfondo: errore non gestito -", e && e.message)
		);
	},

	scegli: async function (carico) {
		const chiave = process.env.UNSPLASH_ACCESS_KEY;

		if (!chiave) {
			const avviso = "UNSPLASH_ACCESS_KEY non impostata su Render";
			console.error("MMM-Sfondo:", avviso);
			this.sendSocketNotification("SFONDO_ERRORE", { messaggio: avviso });
			return;
		}

		/* Una parola di ricerca a caso fra quelle configurate: cosi'
		   i generi si alternano invece di esaurire prima uno e poi
		   l'altro. */
		const ricerche = (carico && carico.ricerche) || ["landscape"];
		const ricerca = ricerche[Math.floor(Math.random() * ricerche.length)];

		const url =
			`${UNSPLASH}/photos/random?query=${encodeURIComponent(ricerca)}` +
			`&orientation=landscape&content_filter=high`;

		try {
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

			console.log(`MMM-Sfondo: nuova foto (${ricerca}) di ${foto?.user?.name || "ignoto"}`);

			this.sendSocketNotification("SFONDO_FOTO", {
				immagine: immagine,
				autore: foto?.user?.name || "",
				profilo: foto?.user?.links?.html || ""
			});
		} catch (errore) {
			console.error("MMM-Sfondo:", errore.message);
			this.sendSocketNotification("SFONDO_ERRORE", { messaggio: errore.message });
		}
	}
});
