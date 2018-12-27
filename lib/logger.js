/**
 * logger.js
 */

// Параметры логирования
const logsection = { start: 1, client: 1, server: 1, command: 1, socket: 0 };
const debugsection = { start: 1, client: 1, server: 1, command: 1, socket: 0 };

module.exports = {
    debug:0,

    setDebug (mode) {
        this.debug = (mode == 'on') ? 1 : 0;
    },

    log (txt, section) {
       if (!section || logsection[section]) {
          process.send({ type: "log", txt });
        } else  if (this.debug && debugsection[section]){
            process.send({ type: "debug", txt });
        }
        
    }
}
