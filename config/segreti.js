/* ==========================================================
   CREDENZIALI - da tenere fuori dal config.js

   Questo file contiene le chiavi e i token. Il config.js lo legge,
   quindi puoi sostituire il config quante volte vuoi senza dover
   reinserire nulla: le credenziali restano qui.

   Va messo nella stessa cartella del config.js, cioe' config/.

   Perche' e' scritto in questo modo: MagicMirror carica il config
   sia con Node sul server sia come script nel browser. La chiave del
   meteo serve nel browser (il modulo meteo interroga il servizio da
   li'), il token Todoist serve sul server (lo usa il node_helper del
   modulo). Le due righe finali fanno in modo che il file funzioni in
   entrambi i contesti: definisce una variabile globale per il browser
   ed esporta lo stesso oggetto per Node.
   ========================================================== */

var SEGRETI = {
	/* Todoist -> Impostazioni -> Integrazioni -> Sviluppatore -> API token */
	todoist: "b5165897484eaae9d7d53d4f5d6378886a331bb5",

	/* openweathermap.org -> profilo -> API keys (piano gratuito, API 2.5).
	   Una chiave appena creata richiede fino a due ore per attivarsi. */
	openweathermap: "91004786c2db7dc4fb96cbe0adc4d4a5"
};

/* Non modificare da qui in poi */
if (typeof module !== "undefined") { module.exports = SEGRETI; }
