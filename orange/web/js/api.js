// Talks to the local Orange server. Every call carries the X-Orange header.
const H = { 'X-Orange': '1' };

async function req(method, name, { query, body } = {}) {
  const qs = query ? '?' + new URLSearchParams(query) : '';
  const opts = { method, headers: { ...H }, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api/${name}${qs}`, opts);
  if (res.status === 423) {
    window.dispatchEvent(new CustomEvent('orange:locked'));
    throw new Error('Your box is locked');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || 'Something went wrong');
  return data;
}

export const api = {
  get: (name, query) => req('GET', name, { query }),
  post: (name, body = {}, query) => req('POST', name, { body, query }),

  fileUrl(path, { dl = false, v = '' } = {}) {
    const q = { path };
    if (dl) q.dl = 1;
    if (v) q.v = v;
    return '/api/file?' + new URLSearchParams(q);
  },

  async text(path) {
    const res = await fetch(api.fileUrl(path, { v: Date.now() }), { credentials: 'same-origin' });
    if (res.status === 423) window.dispatchEvent(new CustomEvent('orange:locked'));
    if (!res.ok) throw new Error('Could not open the file');
    return res.text();
  },

  // Streams one file into the box. XHR is used because fetch has no upload progress.
  upload(path, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload?' + new URLSearchParams({ path }));
      xhr.setRequestHeader('X-Orange', '1');
      xhr.upload.onprogress = e => e.lengthComputable && onProgress && onProgress(e.loaded, e.total);
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* empty */ }
        if (xhr.status === 423) window.dispatchEvent(new CustomEvent('orange:locked'));
        xhr.status < 300 ? resolve(data) : reject(new Error(data.error || 'Upload failed'));
      };
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(file);
    });
  },
};
