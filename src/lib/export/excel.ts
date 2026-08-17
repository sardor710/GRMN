import type { Order } from "@/lib/cms/types";

/**
 * Escapes XML special characters
 */
function escapeXml(unsafe: string | number | undefined | null): string {
  if (unsafe === undefined || unsafe === null) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generates an Excel XML Spreadsheet (.xls compatible with MS Excel, Numbers, Google Sheets)
 * Contains styled headers, bold columns, and separate worksheets for Orders and Itemized Breakdown.
 */
export function generateOrdersExcelXml(orders: Order[]): string {
  const now = new Date().toISOString();

  let ordersRows = "";
  let lineItemsRows = "";

  orders.forEach((o) => {
    const itemsSummary = (o.items || [])
      .map((it) => `${it.name} (x${it.quantity}) - $${(it.price * it.quantity).toFixed(2)}`)
      .join(" | ");

    const formattedDate = new Date(o.createdAt).toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    // Main Orders Sheet Row
    ordersRows += `
    <Row>
      <Cell ss:StyleID="TextCell"><Data ss:Type="String">${escapeXml(o.orderNumber)}</Data></Cell>
      <Cell ss:StyleID="TextCell"><Data ss:Type="String">${escapeXml(o.clientName)}</Data></Cell>
      <Cell ss:StyleID="TextCell"><Data ss:Type="String">${escapeXml(o.clientEmail)}</Data></Cell>
      <Cell ss:StyleID="CurrencyCell"><Data ss:Type="Number">${o.total}</Data></Cell>
      <Cell ss:StyleID="NumberCell"><Data ss:Type="Number">${o.itemsCount || (o.items || []).length}</Data></Cell>
      <Cell ss:StyleID="TextCell"><Data ss:Type="String">${escapeXml(itemsSummary)}</Data></Cell>
      <Cell ss:StyleID="${o.paymentStatus === 'paid' ? 'PaidStatus' : 'PendingStatus'}"><Data ss:Type="String">${escapeXml(o.paymentStatus.toUpperCase())}</Data></Cell>
      <Cell ss:StyleID="TextCell"><Data ss:Type="String">${escapeXml(o.fulfillmentStatus.toUpperCase())}</Data></Cell>
      <Cell ss:StyleID="TextCell"><Data ss:Type="String">${escapeXml(o.shippingAddress)}</Data></Cell>
      <Cell ss:StyleID="TextCell"><Data ss:Type="String">${escapeXml(formattedDate)}</Data></Cell>
    </Row>`;

    // Itemized Line Items Sheet Rows
    (o.items || []).forEach((item, idx) => {
      lineItemsRows += `
    <Row>
      <Cell ss:StyleID="TextCell"><Data ss:Type="String">${escapeXml(o.orderNumber)}</Data></Cell>
      <Cell ss:StyleID="NumberCell"><Data ss:Type="Number">${idx + 1}</Data></Cell>
      <Cell ss:StyleID="TextCell"><Data ss:Type="String">${escapeXml(item.name)}</Data></Cell>
      <Cell ss:StyleID="TextCell"><Data ss:Type="String">${escapeXml(item.productId)}</Data></Cell>
      <Cell ss:StyleID="NumberCell"><Data ss:Type="Number">${item.quantity}</Data></Cell>
      <Cell ss:StyleID="CurrencyCell"><Data ss:Type="Number">${item.price}</Data></Cell>
      <Cell ss:StyleID="CurrencyCell"><Data ss:Type="Number">${item.price * item.quantity}</Data></Cell>
      <Cell ss:StyleID="TextCell"><Data ss:Type="String">${escapeXml(o.clientName)}</Data></Cell>
      <Cell ss:StyleID="TextCell"><Data ss:Type="String">${escapeXml(o.clientEmail)}</Data></Cell>
      <Cell ss:StyleID="TextCell"><Data ss:Type="String">${escapeXml(formattedDate)}</Data></Cell>
    </Row>`;
    });
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>Garmin Official Store Orders Export</Title>
  <Author>Garmin CMS System</Author>
  <Created>${now}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#1E293B"/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#007CC3" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#005A8F"/>
   </Borders>
  </Style>
  <Style ss:ID="SubHeader">
   <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="TextCell">
   <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="NumberCell">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="CurrencyCell">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="&quot;$&quot;#,##0.00"/>
  </Style>
  <Style ss:ID="PaidStatus">
   <Font ss:Color="#15803D" ss:Bold="1"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="PendingStatus">
   <Font ss:Color="#B45309" ss:Bold="1"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
 </Styles>

 <!-- Worksheet 1: Orders Summary -->
 <Worksheet ss:Name="Orders Summary">
  <Table ss:DefaultRowHeight="22">
   <Column ss:Width="95"/>
   <Column ss:Width="130"/>
   <Column ss:Width="180"/>
   <Column ss:Width="90"/>
   <Column ss:Width="70"/>
   <Column ss:Width="250"/>
   <Column ss:Width="90"/>
   <Column ss:Width="110"/>
   <Column ss:Width="280"/>
   <Column ss:Width="130"/>

   <Row ss:StyleID="Header" ss:Height="26">
    <Cell><Data ss:Type="String">Order Number</Data></Cell>
    <Cell><Data ss:Type="String">Customer Name</Data></Cell>
    <Cell><Data ss:Type="String">Customer Email</Data></Cell>
    <Cell><Data ss:Type="String">Total Amount</Data></Cell>
    <Cell><Data ss:Type="String">Items Qty</Data></Cell>
    <Cell><Data ss:Type="String">Products Summary</Data></Cell>
    <Cell><Data ss:Type="String">Payment Status</Data></Cell>
    <Cell><Data ss:Type="String">Fulfillment</Data></Cell>
    <Cell><Data ss:Type="String">Shipping Address</Data></Cell>
    <Cell><Data ss:Type="String">Date Placed</Data></Cell>
   </Row>
   ${ordersRows}
  </Table>
 </Worksheet>

 <!-- Worksheet 2: Itemized Line Items -->
 <Worksheet ss:Name="Itemized Products">
  <Table ss:DefaultRowHeight="20">
   <Column ss:Width="95"/>
   <Column ss:Width="50"/>
   <Column ss:Width="230"/>
   <Column ss:Width="110"/>
   <Column ss:Width="60"/>
   <Column ss:Width="85"/>
   <Column ss:Width="95"/>
   <Column ss:Width="130"/>
   <Column ss:Width="180"/>
   <Column ss:Width="130"/>

   <Row ss:StyleID="SubHeader" ss:Height="26">
    <Cell><Data ss:Type="String">Order Number</Data></Cell>
    <Cell><Data ss:Type="String">Item #</Data></Cell>
    <Cell><Data ss:Type="String">Product Name</Data></Cell>
    <Cell><Data ss:Type="String">Product SKU</Data></Cell>
    <Cell><Data ss:Type="String">Qty</Data></Cell>
    <Cell><Data ss:Type="String">Unit Price</Data></Cell>
    <Cell><Data ss:Type="String">Line Total</Data></Cell>
    <Cell><Data ss:Type="String">Customer Name</Data></Cell>
    <Cell><Data ss:Type="String">Customer Email</Data></Cell>
    <Cell><Data ss:Type="String">Order Date</Data></Cell>
   </Row>
   ${lineItemsRows}
  </Table>
 </Worksheet>
</Workbook>`;
}

/**
 * Generates an Excel-ready UTF-8 CSV with BOM
 */
export function generateOrdersCSV(orders: Order[]): string {
  const headers = [
    "Order Number",
    "Customer Name",
    "Customer Email",
    "Total Amount ($)",
    "Items Count",
    "Purchased Items Summary",
    "Payment Status",
    "Fulfillment Status",
    "Shipping Address",
    "Date Placed",
  ];

  const rows = orders.map((o) => {
    const itemsSummary = (o.items || [])
      .map((it) => `${it.name} (x${it.quantity}, $${it.price})`)
      .join(" ; ");

    const formattedDate = new Date(o.createdAt).toISOString().replace("T", " ").replace("Z", "");

    return [
      `"${o.orderNumber}"`,
      `"${o.clientName.replace(/"/g, '""')}"`,
      `"${o.clientEmail.replace(/"/g, '""')}"`,
      o.total.toFixed(2),
      o.itemsCount || (o.items || []).length,
      `"${itemsSummary.replace(/"/g, '""')}"`,
      `"${o.paymentStatus}"`,
      `"${o.fulfillmentStatus}"`,
      `"${(o.shippingAddress || "").replace(/"/g, '""')}"`,
      `"${formattedDate}"`,
    ].join(",");
  });

  return "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
}

/**
 * Triggers native browser download for an Excel file
 */
export function downloadExcelFile(content: string, filename: string, mimeType = "application/vnd.ms-excel") {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
