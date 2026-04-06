module.exports = async function handler(req, res) {
  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const FIN_DB = process.env.NOTION_FIN_DB || '33af6feb-79cc-8160-b9c7-f1f74abfe0ec';

  if (!NOTION_TOKEN) {
    return res.status(500).json({ error: 'NOTION_TOKEN not configured' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${FIN_DB}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ page_size: 100 })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message });
    }

    const records = data.results.map(page => {
      const p = page.properties;
      return {
        id: page.id,
        registro: p['Registro']?.title?.[0]?.text?.content || '',
        cliente: p['Cliente']?.select?.name || '',
        mesAno: p['Mes/Ano']?.select?.name || '',
        modelo: p['Modelo']?.select?.name || '',
        faturamentoCliente: p['Faturamento Cliente']?.number || 0,
        investimentoAds: p['Investimento Ads']?.number || 0,
        custosOperacionais: p['Custos Operacionais']?.number || 0,
        receitaImpulso: p['Receita Impulso']?.number || 0,
        lucro: p['Lucro']?.number || 0,
        statusPgto: p['Status Pgto']?.select?.name || ''
      };
    });

    // Group by month
    const byMonth = {};
    records.forEach(r => {
      if (!byMonth[r.mesAno]) byMonth[r.mesAno] = [];
      byMonth[r.mesAno].push(r);
    });

    // Calculate totals per month
    const monthSummaries = Object.entries(byMonth).map(([mes, recs]) => {
      const totalReceita = recs.reduce((s, r) => s + r.receitaImpulso, 0);
      const totalCustos = recs.reduce((s, r) => s + r.custosOperacionais, 0);
      const totalLucro = recs.reduce((s, r) => s + r.lucro, 0);
      const margem = totalReceita > 0 ? ((totalLucro / totalReceita) * 100).toFixed(1) : '0';
      return { mes, totalReceita, totalCustos, totalLucro, margem: parseFloat(margem), clients: recs };
    });

    // Current month summary
    const currentMonth = monthSummaries[0] || { totalReceita: 0, totalCustos: 0, totalLucro: 0, margem: 0, clients: [] };

    // Inadimplencia
    const inadimplentes = records.filter(r => r.statusPgto === 'Atrasado' || r.statusPgto === 'Pendente');

    res.status(200).json({
      records,
      monthSummaries,
      currentMonth,
      inadimplentes,
      totalRecords: records.length,
      lastSync: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
