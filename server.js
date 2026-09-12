require('dotenv').config();
const express = require('express');
const products = require('./products');

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.get('/api/products', (req, res) => {
  res.json(products);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});