const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;;

app.get('/', async (req, res) => {
    try {
      const { USER, PASS } = req.query

      const atokenCommand = [
          'curl -X GET',
          'https://self.controlecelular.com.br/api/v1/atoken/index.php',
          '--header "Accept: application/json"',
          '--header "Content-Type: application/json"',
          `--user ${USER}:${PASS}`
      ].join(' ');

      const { stdout: atokenResponse } = await execPromise(atokenCommand);
      const atokenData = JSON.parse(atokenResponse);
      console.log({atokenData});

      setTimeout(async () => {
          const rtokenCommand = [
              'curl -X GET -L',
              'https://self.controlecelular.com.br/api/v1/rtoken',
              '--header "Accept: application/json"',
              '--header "Content-Type: application/json"',
              `--header "Authorization: Bearer ${atokenData.refresh_token}"`
          ].join(' ');
  
          const { stdout: rtokenResponse } = await execPromise(rtokenCommand);
          const rtokenData = JSON.parse(rtokenResponse);
          console.log({rtokenData});

          const reciboCommand = [
              'curl -X GET -L',
              '"https://self.controlecelular.com.br/api/v1/relatorios/?idRelat=integracao/vendedores/cadastro&com=gerarRelatorio"',
              '--header "Accept: application/json"',
              '--header "Content-Type: application/json"',
              `--header "Authorization: Bearer ${rtokenData.access_token}"`
          ].join(' ');
  
          const { stdout: reciboResponse } = await execPromise(reciboCommand);
          const reciboData = JSON.parse(reciboResponse);
          console.log({reciboData});

          setTimeout(async () => {
              const respostaCommand = [
                  'curl -X GET -L',
                  `"https://self.controlecelular.com.br/api/v1/relatorios?idRelat=integracao/vendedores/cadastro/&recibo=${reciboData.recibo}"`,
                  '--header "Accept: application/json"',
                  '--header "Content-Type: application/json"',
                  `--header "Authorization: Bearer ${rtokenData.access_token}"`
              ].join(' ');
      
              const { stdout: respostaResponse } = await execPromise(respostaCommand);
              const respostaData = JSON.parse(respostaResponse);
              console.log({ respostaData});

              res.json({ data: respostaData });
          }, 5000)    
      }, 10000)
    } catch (error) {
        console.error('Erro completo:', error);
        res.status(500).json({ 
            error: error.message,
            stderr: error.stderr 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});