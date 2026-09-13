require('dotenv').config();
const express = require('express');
const products = require('./products');

const ALLOWED_COUNTRIES = ['AU', 'GB', 'DE', 'SG', 'US'];

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.get('/api/products', (req, res) => {
  res.json(products);
});

app.post('/api/client-session', async (req, res) => {
  const { items, countryCode } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  if (!ALLOWED_COUNTRIES.includes(countryCode)) {
    return res.status(400).json({ error: 'Unsupported shopper country' });
  }

  const lineItems = [];
  for (const item of items) {
    const product = products.find(p => p.id === item.id);
    if (!product) {
      return res.status(400).json({ error: `Unknown product: ${item.id}` });
    }
    lineItems.push({
      itemId: product.id,
      description: product.name,
      amount: product.price,
      quantity: item.quantity
    });
  }

  const amount = lineItems.reduce((sum, li) => sum + li.amount * li.quantity, 0);
  const orderId = `buymore-${Date.now()}`;

  try {
    const response = await fetch('https://api.sandbox.primer.io/client-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': process.env.PRIMER_API_KEY,
        'X-Api-Version': '2.4'
      },
      body: JSON.stringify({
        orderId,
        currencyCode: 'AUD',
        amount,
        order: { lineItems, countryCode }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Primer client session failed:', response.status, data);
      return res.status(502).json({ error: 'Could not start checkout' });
    }

    res.json({ clientToken: data.clientToken, orderId, amount });
  } catch (err) {
    console.error('Client session request error:', err);
    res.status(502).json({ error: 'Could not start checkout' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});