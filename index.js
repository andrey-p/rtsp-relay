// @ts-check
const { path: ffmpegPath } = require('@ffmpeg-installer/ffmpeg');
const { spawn } = require('child_process');
const ews = require('express-ws');
const ps = require('ps-node');
const { version } = require('./package.json');
const InboundStreamWrapper = require('./InboundStreamWrapper.js');

/**
 * @typedef {{
 *  url: string;
 *  additionalFlags?: string[];
 *  verbose?: boolean;
 * }} Options
 *
 * @typedef {import("express").Application} Application
 * @typedef {import("ws")} WebSocket
 * @typedef {import("child_process").ChildProcessWithoutNullStreams} Stream
 */

/** @type {ReturnType<ews>} */
let wsInstance;

/**
 * @param {Application} app the express application
 * @param {import("http").Server | import("https").Server} [server] optional - if you use HTTPS you will need to pass in the server
 */
module.exports = (app, server) => {
  if (!wsInstance) wsInstance = ews(app, server);
  const wsServer = wsInstance.getWss();

  /**
   * This map stores all the streams in existance, keyed by the URL.
   * This means we only ever create one InboundStream per URL.
   * @type {{ [url: string]: InboundStreamWrapper }}
   */
  const Inbound = {};

  return {
    /**
     * You must include a script tag in the HTML to import this script
     *
     * Alternatively, if you have set up a build process for front-end
     * code, you can import it instead:
     * ```js
     * import { loadPlayer } from "rtsp-relay/browser";
     * ```
     */
    scriptUrl: `https://cdn.jsdelivr.net/npm/rtsp-relay@${version}/browser/index.js`,

    killAll() {
      ps.lookup({ command: 'ffmpeg' }, (err, list) => {
        if (err) throw err;
        list
          .filter((p) => p.arguments.includes('mpeg1video'))
          .forEach(({ pid }) => ps.kill(pid));
      });
    },

    /** @param {Options} props */
    proxy({ url, additionalFlags = [], verbose }) {
      if (!url) throw new Error('URL to rtsp stream is required');

      // TODO: node15 use ||=
      if (!Inbound[url]) Inbound[url] = new InboundStreamWrapper();

      /** @param {WebSocket} ws */
      function handler(ws) {
        // these should be detected from the source stream
        const [width, height] = [0x0, 0x0];

        const streamHeader = Buffer.alloc(0x8);
        streamHeader.write('jsmp');
        streamHeader.writeUInt16BE(width, 0x4);
        streamHeader.writeUInt16BE(height, 0x6);
        ws.send(streamHeader, { binary: true });

        if (verbose) console.log('[rtsp-relay] New WebSocket Connection');

        const streamIn = Inbound[url].get({ url, additionalFlags, verbose });

        /** @param {Buffer} chunk */
        function onData(chunk) {
          if (ws.readyState === ws.OPEN) ws.send(chunk);
        }

        ws.on('close', () => {
          const c = wsServer.clients.size;
          if (verbose) {
            console.log(`[rtsp-relay] WebSocket Disconnected ${c} left`);
          }
          Inbound[url].kill(c);
          streamIn.stdout.off('data', onData);
        });

        streamIn.stdout.on('data', onData);
      }
      return handler;
    },
  };
};

module.exports.InboundStreamWrapper = InboundStreamWrapper;
