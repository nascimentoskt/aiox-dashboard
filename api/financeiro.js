module.exports = async function handler(req, res) {
  var NOTION_TOKEN = process.env.NOTION_TOKEN;
  var FIN_DB = process.env.NOTION_FIN_DB || '33af6feb-79cc-8160-b9c7-f1f74abfe0ec';

  if (!NOTION_TOKEN) return res.status(500).json({ error: 'NOTION_TOKEN not configured' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  try {
    // Paginate to get ALL records
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
      var receita = p['Receita Impulso'] && p['Receita Impulso'].number ? p['Receita Impulso'].number : 0;
      var custos = p['Custos Operacionais'] && p['Custos Operacionais'].number ? p['Custos Operacionais'].number : 0;

      return {
        id: page.id,
        nome: (p['Registro'] && p['Registro'].title && p['Registro'].title[0]) ? p['Registro'].title[0].text.content : '',
        cliente: p['Cliente'] && p['Cliente'].select ? p['Cliente'].select.name : '',
        mesAno: p['Mes/Ano'] && p['Mes/Ano'].select ? p['Mes/Ano'].select.name : '',
        modelo: p['Modelo'] && p['Modelo'].select ? p['Modelo'].select.name : '',
        receita: receita,
        custos: custos,
        lucro: receita - custos,
        status: p['Status Pgto'] && p['Status Pgto'].select ? p['Status Pgto'].select.name : '',
        type: receita > 0 ? 'receita' : (custos > 0 ? 'despesa' : 'outro'),
        lastEdited: page.last_edited_time,
        url: page.url
      };
    });

    // Separate receitas and despesas
    var receitas = records.filter(function(r) { return r.receita > 0; });
    var despesas = records.filter(function(r) { return r.custos > 0; });

    // Get unique months sorted
    var monthSet = {};
    records.forEach(function(r) { if (r.mesAno) monthSet[r.mesAno] = true; });
    var months = Object.keys(monthSet).sort(function(a, b) {
      var order = { 'Jan': 1, 'Fev': 2, 'Mar': 3, 'Abr': 4, 'Mai': 5, 'Jun': 6, 'Jul': 7, 'Ago': 8, 'Set': 9, 'Out': 10, 'Nov': 11, 'Dez': 12 };
      var ma = a.split('/')[0]; var mb = b.split('/')[0];
      var ya = a.split('/')[1]; var yb = b.split('/')[1];
      if (ya !== yb) return ya < yb ? -1 : 1;
      return (order[ma] || 0) - (order[mb] || 0);
    });

    // Calculate per-month summaries
    var byMonth = {};
    records.forEach(function(r) {
      if (!r.mesAno) return;
      if (!byMonth[r.mesAno]) byMonth[r.mesAno] = { receita: 0, custos: 0, receitas: [], despesas: [] };
      byMonth[r.mesAno].receita += r.receita;
      byMonth[r.mesAno].custos += r.custos;
      if (r.receita > 0) byMonth[r.mesAno].receitas.push(r);
      if (r.custos > 0) byMonth[r.mesAno].despesas.push(r);
    });

    // Calculate totals
    var monthSummaries = months.map(function(mes) {
      var m = byMonth[mes] || { receita: 0, custos: 0, receitas: [], despesas: [] };
      var lucro = m.receita - m.custos;
      var margem = m.receita > 0 ? ((lucro / m.receita) * 100) : 0;
      return {
        mes: mes,
        receita: m.receita,
        custos: m.custos,
        lucro: lucro,
        margem: Math.round(margem * 10) / 10,
        receitas: m.receitas,
        despesas: m.despesas
      };
    });

    // All-time totals
    var totalReceita = records.reduce(function(s, r) { return s + r.receita; }, 0);
    var totalCustos = records.reduce(function(s, r) { return s + r.custos; }, 0);

    // Clients breakdown
    var byCliente = {};
    receitas.forEach(function(r) {
      if (!byCliente[r.cliente]) byCliente[r.cliente] = 0;
      byCliente[r.cliente] += r.receita;
    });

    var clienteList = Object.keys(byCliente).map(function(c) {
      return { nome: c, valor: byCliente[c], pct: totalReceita > 0 ? Math.round(byCliente[c] / totalReceita * 1000) / 10 : 0 };
    }).sort(function(a, b) { return b.valor - a.valor; });

    res.status(200).json({
      records: records,
      receitas: receitas,
      despesas: despesas,
      months: months,
      monthSummaries: monthSummaries,
      clienteList: clienteList,
      totals: { receita: totalReceita, custos: totalCustos, lucro: totalReceita - totalCustos, margem: totalReceita > 0 ? Math.round((totalReceita - totalCustos) / totalReceita * 1000) / 10 : 0 },
      totalRecords: records.length,
      lastSync: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
