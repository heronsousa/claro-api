const { exec, spawn } = require('child_process');
const util = require('util');
const express = require("express");

const execPromise = util.promisify(exec);
const app = express();

const PORT = process.env.PORT || 3000;

const hoje = new Date();
hoje.setDate(hoje.getDate() - 30);
const trintaDiasAtras = hoje.toISOString().split('T')[0]

const today = new Date().toISOString().split('T')[0]

const TABELAS_SOLICITAR = {
  tradein: async (accessToken) => getTradeinSolicitar(accessToken),
  vendedores: async (accessToken) => getVendedoresSolicitar(accessToken),
  valores: async (accessToken) => getValoresAReceberSolicitar(accessToken),
  conferencia: async (accessToken) => getConferenciaSolicitar(accessToken),
  produtos: async (accessToken) => getDetalhadoProdutoSolicitar(accessToken),
  estoque_fisico: async (accessToken) => getEstoqueFisicoSolicitar(accessToken),
  estoque_por_local: async (accessToken) => getEstoquePorLocalSolicitar(accessToken),
}

const TABELAS_RESPOSTA = {
  tradein: async (recibo, accessToken) => getTradeinResposta(recibo, accessToken),
  vendedores: async (recibo, accessToken) => getVendedoresResposta(recibo, accessToken),
  valores: async (recibo, accessToken) => getValoresAReceberResposta(recibo, accessToken),
  conferencia: async (recibo, accessToken) => getConferenciaResposta(recibo, accessToken),
  produtos: async (recibo, accessToken) => getDetalhadoProdutoResposta(recibo, accessToken),
  estoque_fisico: async (recibo, accessToken) => getEstoqueFisicoResposta(recibo, accessToken),
  estoque_por_local: async (recibo, accessToken) => getEstoquePorLocalResposta(recibo, accessToken),
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const TABELAS = ["valores", "produtos", "conferencia", "tradein", "estoque_por_local", "vendedores", "estoque_fisico"]

const emExecucao = new Set();

app.get('/:table', async (req, res) => {
  const table = req.params.table;

  if (emExecucao.has(table)) {
    return res.status(429).json({ error: `A tabela "${table}" já está sendo processada.` });
  }

  emExecucao.add(table);

  try {
    const { USER, PASS } = req.query;
    console.log({ USER, PASS });

    if (!USER || !PASS) {
      return res.status(400).json({ error: 'Usuário ou senha não informados' });
    }

    const atokenCommand = [
      'curl -X GET',
      'https://self.controlecelular.com.br/api/v1/atoken/index.php',
      '--header "Accept: application/json"',
      '--header "Content-Type: application/json"',
      `--user ${USER}:${PASS}`
    ].join(' ');

    const { stdout: atokenResponse } = await execPromise(atokenCommand);
    const atokenData = JSON.parse(atokenResponse);
    console.log({ atokenData });

    await delay(10000);

    const rtokenUrl = 'https://self.controlecelular.com.br/api/v1/rtoken';
    const rtokenResponse = await mountRequest(atokenData.refresh_token, rtokenUrl);
    const rtokenData = rtokenResponse.access_token;
    console.log({ rtokenData });

    const recibo = await TABELAS_SOLICITAR[table](rtokenData);
    console.log({ recibo });


    for (const i of [1, 2, 3]) {
      console.log(i)

      await delay(30000);

      const resposta = await TABELAS_RESPOSTA[table](recibo, rtokenData);

      console.log({ resposta });

      if (resposta.head) {
        const tableFormated = formatTable(resposta)
        console.log({ tableFormated });

        res.json({ data: tableFormated });

        break;
      }
    }

    res.json({ error: 1 });
  } catch (error) {
    console.error('Erro completo:', error);
    res.status(500).json({
      error: error.message,
      stderr: error.stderr
    });
  } finally {
    emExecucao.delete(table);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

function formatTable(table) {
  const head = Object.entries(table.head[0]).map(([column, value]) => ({ column, label: value.label }))

  const body = table.body.map(i => i.reduce((acc, item, idx) => {
    acc[head[idx].column] = item

    return acc
  }, {}))

  return {
    ...table,
    head,
    body
  }
}

async function mountRequest(accessToken, url) {
  const headers = [
    '--header', 'Accept: application/json',
    '--header', 'Content-Type: application/json',
    '--header', `Authorization: Bearer ${accessToken}`
  ];

  return new Promise((resolve, reject) => {
    const curl = spawn('curl', ['-X', 'GET', '-L', url, ...headers]);

    let data = '';
    curl.stdout.on('data', chunk => data += chunk);
    curl.stderr.on('data', chunk => console.error('stderr:', chunk.toString()));
    curl.on('error', reject);
    curl.on('close', code => {
      if (code !== 0) return reject(new Error(`curl failed with code ${code}`));
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON: ' + e.message));
      }
    });
  });
}

// detalhado_produto ------------------------------------------------------------------ 

async function getDetalhadoProdutoResposta(recibo, accessToken) {
  const url = `https://self.controlecelular.com.br/api/v1/relatorios?idRelat=integracao/atendimentos/detalhado_produto/&recibo=${recibo}`;

  return await mountRequest(accessToken, url)
}

async function getDetalhadoProdutoSolicitar(accessToken) {
  const url = `https://self.controlecelular.com.br/api/v1/relatorios/?idRelat=integracao/atendimentos/detalhado_produto/&com=gerarRelatorio&data_ini=${trintaDiasAtras}&data_fin=${new Date().toISOString().split('T')[0]}`

  const reciboData = await mountRequest(accessToken, url)
  return reciboData.recibo
}

// valores_a_receber ------------------------------------------------------------------

async function getValoresAReceberResposta(recibo, accessToken) {
  const url = `https://self.controlecelular.com.br/api/v1/relatorios?idRelat=integracao/operadora/valores_a_receber/&recibo=${recibo}`

  return await mountRequest(accessToken, url)
}

async function getValoresAReceberSolicitar(accessToken) {
  const url = `https://self.controlecelular.com.br/api/v1/relatorios/?idRelat=integracao/operadora/valores_a_receber&com=gerarRelatorio&data_ini=${trintaDiasAtras}&data_fin=${today}`

  const reciboData = await mountRequest(accessToken, url)
  return reciboData.recibo
}

// conferencia ------------------------------------------------------------------

async function getConferenciaResposta(recibo, accessToken) {
  const url = `https://self.controlecelular.com.br/api/v1/relatorios?idRelat=integracao/atendimentos/conferencia/&recibo=${recibo}`

  return await mountRequest(accessToken, url)
}

async function getConferenciaSolicitar(accessToken) {
  const url = `https://self.controlecelular.com.br/api/v1/relatorios/?idRelat=integracao/atendimentos/conferencia/&com=gerarRelatorio&data_ini=${trintaDiasAtras}&data_fin=${today}`

  const reciboData = await mountRequest(accessToken, url)
  return reciboData.recibo
}

// trade_in ------------------------------------------------------------------

async function getTradeinResposta(recibo, accessToken) {
  const url = `https://self.controlecelular.com.br/api/v1/relatorios?idRelat=integracao/utilitarios/trade_in/&recibo=${recibo}`

  return await mountRequest(accessToken, url)
}

async function getTradeinSolicitar(accessToken) {
  const url = `https://self.controlecelular.com.br/api/v1/relatorios/?idRelat=integracao/utilitarios/trade_in/&com=gerarRelatorio&data_ini=${trintaDiasAtras}&data_fin=${today}`

  const reciboData = await mountRequest(accessToken, url)
  return reciboData.recibo
}

// vendedores ------------------------------------------------------------------

async function getVendedoresResposta(recibo, accessToken) {
  const url = `https://self.controlecelular.com.br/api/v1/relatorios?idRelat=integracao/vendedores/cadastro/&recibo=${recibo}`

  return await mountRequest(accessToken, url)
}

async function getVendedoresSolicitar(accessToken) {
  const url = `https://self.controlecelular.com.br/api/v1/relatorios/?idRelat=integracao/vendedores/cadastro&com=gerarRelatorio`

  const reciboData = await mountRequest(accessToken, url)
  return reciboData.recibo
}

// estoque_por_local ------------------------------------------------------------------

async function getEstoquePorLocalResposta(recibo, accessToken) {
  const url = `https://self.controlecelular.com.br/api/v1/relatorios?idRelat=integracao/produtos/estoque_por_local/&recibo=${recibo}`

  return await mountRequest(accessToken, url)
}

async function getEstoquePorLocalSolicitar(accessToken) {
  const url = `https://self.controlecelular.com.br/api/v1/relatorios/?idRelat=integracao/produtos/estoque_por_local/&com=gerarRelatorio`

  const reciboData = await mountRequest(accessToken, url)
  return reciboData.recibo
}

// estoque_fisico ------------------------------------------------------------------

async function getEstoqueFisicoResposta(recibo, accessToken) {
  const url = `https://self.controlecelular.com.br/api/v1/relatorios?idRelat=integracao/produtos/estoque_fisico/&recibo=${recibo}`

  return await mountRequest(accessToken, url)
}

async function getEstoqueFisicoSolicitar(accessToken) {
  const url = `https://self.controlecelular.com.br/api/v1/relatorios/?idRelat=integracao/produtos/estoque_fisico/&com=gerarRelatorio`

  const reciboData = await mountRequest(accessToken, url)
  return reciboData.recibo
}
