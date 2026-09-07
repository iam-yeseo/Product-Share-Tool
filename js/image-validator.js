/* Loading an ordinary cross-origin <img> does not require a CORS fetch. */
var ImageValidator = {
  check: function (url, timeoutMs) {
    return new Promise(function (resolve) {
      var image = new Image(), ended = false;
      var timer = setTimeout(function () { finish('timeout'); }, timeoutMs || 15000);
      function finish(status) {
        if (ended) return;
        ended = true; clearTimeout(timer);
        image.onload = image.onerror = null;
        resolve({ url: url, status: status, width: image.naturalWidth || 0, height: image.naturalHeight || 0, checkedAt: new Date().toISOString() });
        if (status !== 'valid') image.src = '';
      }
      image.onload = async function () {
        try {
          if (image.decode) await image.decode();
          finish(image.naturalWidth > 0 && image.naturalHeight > 0 ? 'valid' : 'error');
        } catch (_) { finish('error'); }
      };
      image.onerror = function () { finish('error'); };
      image.src = url;
    });
  },
  pool: async function (jobs, worker, limit) {
    var next = 0;
    await Promise.all(Array.from({ length: Math.min(limit || 3, jobs.length) }, async function () {
      while (next < jobs.length) { var job = jobs[next++]; await worker(job); }
    }));
  }
};
if (typeof module !== 'undefined') module.exports = ImageValidator;
