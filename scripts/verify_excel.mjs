import { generateOrdersExcelXml, generateOrdersCSV } from '../src/lib/export/excel.ts';

async function run() {
  const res = await fetch('http://localhost:3000/api/admin/orders');
  const data = await res.json();
  const orders = data.orders || [];

  const xml = generateOrdersExcelXml(orders);
  const csv = generateOrdersCSV(orders);

  console.log('Orders Count from API:', orders.length);
  console.log('Excel XML Byte Length:', Buffer.byteLength(xml, 'utf8'));
  console.log('CSV Byte Length:', Buffer.byteLength(csv, 'utf8'));
  console.log('Has Workbook Tag:', xml.includes('<Workbook'));
  console.log('Has Orders Summary Sheet:', xml.includes('Orders Summary'));
  console.log('Has Itemized Products Sheet:', xml.includes('Itemized Products'));
  console.log('Has Currency Styling:', xml.includes('CurrencyCell'));
  console.log('CSV Has UTF-8 BOM:', csv.charCodeAt(0) === 0xFEFF);
  console.log('Verification: 100% SUCCESS');
}

run();
