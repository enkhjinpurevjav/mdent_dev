/**
 * Converts a potentially relative image URL to an absolute URL so that the
 * print popup (which has no meaningful base URL) can always resolve the image.
 */
function toAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const origin = window.location.origin;
  if (url.startsWith("/")) return `${origin}${url}`;
  return `${origin}/${url}`;
}

/**
 * Opens a dedicated print-preview window for an image (e.g. XRAY).
 * Auto-detects orientation: landscape if naturalWidth > naturalHeight, else portrait.
 * Uses A4 page size with the correct orientation and scales the image to fit.
 */
export function printImage(imageUrl: string): void {
  const absoluteUrl = toAbsoluteUrl(imageUrl);
  const origin = window.location.origin;
  const win = window.open("", "_blank", "width=900,height=700,noopener");
  if (!win) return;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <base href="${origin}/" />
  <title>XRAY хэвлэх</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #fff; }
    .container {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100vh;
    }
    #loading-msg, #error-msg {
      font-family: sans-serif;
      font-size: 14px;
      color: #555;
    }
    #error-msg { color: #c00; display: none; }
    img {
      max-width: 100%;
      max-height: 100vh;
      object-fit: contain;
      display: none;
    }
    @media print {
      html, body { width: 100%; height: 100%; }
      #loading-msg, #error-msg { display: none !important; }
      .container {
        width: 100%;
        height: 100%;
        page-break-inside: avoid;
      }
      img {
        display: block !important;
        max-width: 100%;
        max-height: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <p id="loading-msg">Зураг ачаалж байна...</p>
    <p id="error-msg">Зураг ачаалахад алдаа гарлаа.</p>
    <img id="xray-img" src="${absoluteUrl.replace(/"/g, "&quot;")}" alt="XRAY" />
  </div>
  <script>
    var img = document.getElementById('xray-img');
    var loadingMsg = document.getElementById('loading-msg');
    var errorMsg = document.getElementById('error-msg');
    window.addEventListener('afterprint', function() { window.close(); }, { once: true });
    function applyOrientation(orientation) {
      var style = document.createElement('style');
      style.textContent = '@page { size: A4 ' + orientation + '; margin: 10mm; }';
      document.head.appendChild(style);
    }
    function doPrint() {
      var orientation = img.naturalWidth > img.naturalHeight ? 'landscape' : 'portrait';
      applyOrientation(orientation);
      loadingMsg.style.display = 'none';
      img.style.display = 'block';
      window.print();
    }
    function onError() {
      loadingMsg.style.display = 'none';
      errorMsg.style.display = 'block';
    }
    if (img.complete && img.naturalWidth > 0) {
      doPrint();
    } else {
      img.addEventListener('load', doPrint);
      img.addEventListener('error', onError);
    }
  </script>
</body>
</html>`;

  try {
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch (err) {
    console.error("[printImage] Failed to write to print popup:", err);
  }
}
