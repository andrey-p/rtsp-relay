class InboundStreamWrapper {
  /** @param {Options} props */
  start({ url, additionalFlags = [] }) {
    if (this.verbose) console.log('[rtsp-relay] Creating brand new stream');

    this.stream = spawn(
      ffmpegPath,
      [
        '-i',
        url,
        '-f', // force format
        'mpegts',
        '-codec:v', // specify video codec (MPEG1 required for jsmpeg)
        'mpeg1video',
        '-r',
        '30', // 30 fps. any lower and the client can't decode it
        ...additionalFlags,
        '-',
      ],
      { detached: false },
    );
    this.stream.stderr.on('data', () => {});
    this.stream.stderr.on('error', (e) => console.log('err:error', e));
    this.stream.stdout.on('error', (e) => console.log('out:error', e));
    this.stream.on('error', (err) => {
      if (this.verbose) {
        console.warn(`[rtsp-relay] Internal Error: ${err.message}`);
      }
    });

    this.stream.on('exit', (_code, signal) => {
      if (signal !== 'SIGTERM') {
        if (this.verbose) {
          console.warn(
            '[rtsp-relay] Stream died - will recreate when the next client connects',
          );
        }
        this.stream = null;
      }
    });
  }

  /** @param {Options} options */
  get(options) {
    this.verbose = options.verbose;
    if (!this.stream) this.start(options);
    return /** @type {Stream} */ (this.stream);
  }

  /** @param {number} clientsLeft */
  kill(clientsLeft) {
    if (!this.stream) return; // the stream is currently dead
    if (!clientsLeft) {
      if (this.verbose) {
        console.log('[rtsp-relay] no clients left; destroying stream');
      }
      this.stream.kill('SIGTERM');
      this.stream = null;
      // next time it is requested it will be recreated
    }
    if (this.verbose) {
      console.log(
        '[rtsp-relay] there are still some clients so not destroying stream',
      );
    }
  }
}
