const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const distPath = path.join(__dirname, 'dist', 'front-alert-guard', 'browser');

console.log('Serving files from:', distPath);

// CRÍTICO: Configurar MIME types y deshabilitar etag
app.use((req, res, next) => {
  // Si es un archivo estático, setear headers apropiados
  if (req.url.match(/\.(js|css|json|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
    const ext = path.extname(req.url);
    const mimeTypes = {
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject'
    };
    
    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext]);
    }
  }
  next();
});

// Servir archivos estáticos
app.use(express.static(distPath, {
  maxAge: '1y',
  etag: false,
  lastModified: false
}));

// Wildcard solo para rutas de Angular (no archivos)
app.get('*', (req, res) => {
  console.log('Wildcard route hit for:', req.url);
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      res.status(500).send('Error loading application');
    }
  });
});

app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
  console.log(`📁 Serving from: ${distPath}`);
});