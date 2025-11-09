const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Ruta a los archivos compilados
const distPath = path.join(__dirname, 'dist', 'front-alert-guard', 'browser');

console.log('Serving files from:', distPath);

// IMPORTANTE: Servir archivos estáticos ANTES del wildcard
app.use(express.static(distPath, {
  index: false, // No servir index.html automáticamente
  setHeaders: (res, filepath) => {
    // Asegurar MIME types correctos
    if (filepath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    } else if (filepath.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    } else if (filepath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=UTF-8');
    } else if (filepath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    }
  }
}));

// El wildcard debe ir AL FINAL
app.get('*', (req, res) => {
  // Log para debugging
  console.log('Wildcard route hit for:', req.url);
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
  console.log(`📁 Serving from: ${distPath}`);
});