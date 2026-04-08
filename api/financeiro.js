module.exports = async function handler(req, res) {
  var NOTION_TOKEN = process.env.NOTION_TOKEN;
  var FIN_DB = process.env.NOTION_FIN_DB || '33af6feb-79cc-8160-b9c7-f1f74abfe0ec';
  if (!NOTION_TOKEN) return res.status(500).json({ error: 'NOTION_TOKEN not configured' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

  try {
    var allResults = [];
    var hasMore = true;
    var cursor = undefined;

    while (hasMore) {
      var body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      var response = await fetch('https://api.notion.com/v1/databases/' + FIN_DB + '/query', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.message });
      allResults = allResults.concat(data.results);
      hasMore = data.has_more || false;
      cursor = data.next_cursor || undefined;
    }

    var records = allResults.map(function(page) {
      var p = page.properties;
      var receita = (p['Receita Impulso'] && p['Receita Impulso'].number) || 0;
      var custos = (p['Custos Operacionais'] && p['Custos Operacionais'].number) || 0;
      return {
        id: page.id,
        nome: (p['Registro'] && p['Registro'].title && p['Registro'].title[0]) ? p['Registro'].title[0].text.content : '',
        cliente: (p['Cliente'] && p['Cliente'].select) ? p['Cliente'].select.name : '',
        mesAno: (p['Mes/Ano'] && p['Mes/Ano'].select) ? p['Mes/Ano'].select.name : '',
        modelo: (p['Modelo'] && p['Modelo'].select) ? p['Modelo'].select.name : '',
        receita: receita,
        custos: custos,
        status: (p['Status Pgto'] && p['Status Pgto'].select) ? p['Status Pgto'].select.name : 'Pendente',
        type: receita > 0 ? 'receita' : 'despesa'
      };
    });

    // Separate
    var receitas = records.filter(function(r) { return r.receita > 0; });
    var despesas = records.filter(function(r) { return r.custos > 0; });

    // Get months sorted
    var monthOrder = { 'Jan':1,'Fev':2,'Mar':3,'Abr':4,'Mai':5,'Jun':6,'Jul':7,'Ago':8,'Set':9,'Out':10,'Nov':11,'Dez':12 };
    var monthSet = {};
    records.forEach(function(r) { if (r.mesAno) monthSet[r.mesAno] = true; });
    var months = Object.keys(monthSet).sort(function(a, b) {
      var pa = a.split('/'); var pb = b.split('/');
      if (pa[1] !== pb[1]) return (pa[1] || '').localeCompare(pb[1] || '');
      return (monthOrder[pa[0]] || 0) - (monthOrder[pb[0]] || 0);
    });

    // Per-month summaries
    var byMonth = {};
    records.forEach(function(r) {
      if (!r.mesAno) return;
      if (!byMonth[r.mesAno]) byMonth[r.mesAno] = { receitas: [], despesas: [], totalReceita: 0, totalCustos: 0 };
      if (r.receita > 0) { byMonth[r.mesAno].receitas.push(r); byMonth[r.mesAno].totalReceita += r.receita; }
      if (r.custos > 0) { byMonth[r.mesAno].despesas.push(r); byMonth[r.mesAno].totalCustos += r.custos; }
    });

    var summaries = months.map(function(mes) {
      var m = byMonth[mes];
      var lucro = m.totalReceita - m.totalCustos;
      return { mes: mes, receita: m.totalReceita, custos: m.totalCustos, lucro: lucro, margem: m.totalReceita > 0 ? Math.round(lucro / m.totalReceita * 1000) / 10 : 0, receitas: m.receitas, despesas: m.despesas };
    });

    // Totals
    var totalReceita = 0; var totalCustos = 0;
    records.forEach(function(r) { totalReceita += r.receita; totalCustos += r.custos; });

    // Client breakdown
    var byCliente = {};
    receitas.forEach(function(r) { byCliente[r.cliente] = (byCliente[r.cliente] || 0) + r.receita; });
    var clientes = Object.keys(byCliente).map(function(c) {
      return { nome: c, valor: byCliente[c], pct: totalReceita > 0 ? Math.round(byCliente[c] / totalReceita * 1000) / 10 : 0 };
    }).sort(function(a, b) { return b.valor - a.valor; });

    res.status(200).json({
      receitas: receitas, despesas: despesas, months: months, summaries: summaries, clientes: clientes,
      totals: { receita: totalReceita, custos: totalCustos, lucro: totalReceita - totalCustos, margem: totalReceita > 0 ? Math.round((totalReceita - totalCustos) / totalReceita * 1000) / 10 : 0 },
      total: records.length, lastSync: new Date().toISOString()
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
};
