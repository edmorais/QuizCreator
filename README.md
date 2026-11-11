# Quiz Creator

Aplicação web para preparar quizzes de bar: escrever ou sortear as perguntas, organizá-las por tema, definir a ordem e exportar a apresentação em PowerPoint, com 11 templates à escolha.

Nasceu para as quiz nights da Casa da Madeira. Por isso, a interface e a base de perguntas estão em português de Portugal, e a configuração de origem inclui uma pergunta sobre a Madeira.

A aplicação é estática e não tem servidor nem contas de utilizador. Corre no browser, e os quizzes e o banco de perguntas ficam guardados nesse browser.

## Estrutura de um quiz

A configuração de origem é esta, e pode ser mudada no separador **Configurar**:

| Pergunta | Descrição |
|---|---|
| Aproximação | Lida no início. A resposta é um número e só é revelada no fim, para desempatar. |
| 1 | Pergunta local, sobre a Madeira. |
| 2 a 49 | 6 perguntas de cada um dos 8 temas. |
| 50 | Guilhotina: quatro palavras e a palavra que as liga. |

Os 8 temas são: História, Ciências Exatas, Desporto e Jogos, Música, Cinema e TV, Arte e Design, Literatura, Filosofia e Ciências Sociais, Atualidade, e Locais e Geografia.

### Configurar

- **Temas:** ligar e desligar os 7 temas que têm perguntas na base, criar temas personalizados (Atualidade é um deles) e mudar nomes, cores e ordem. Até 12 temas. Um tema desligado guarda as perguntas que tinha.
- **Perguntas especiais:** aproximação, pergunta local, Guilhotina e até 4 perguntas extra. Cada uma pode ir para o início ou para o fim e ser numerada ou lida fora da contagem. A pergunta local muda de nome conforme o sítio onde o quiz é apresentado, e cada nome tem a sua categoria no banco.
- **Tamanho e rondas:** perguntas por tema e número de rondas na ordem misturada, até 100 perguntas no total. A regra de repetição vai de «nunca o mesmo tema seguido» até «sem repetir em N seguidas», sendo N o número de temas.
- **Verificações:** ligar e desligar os avisos, e criar regras do tipo «pelo menos N perguntas do tema T com a etiqueta X», como a de haver uma pergunta sobre o Porto. O preenchimento automático respeita as regras.
- **Predefinição:** guardar a configuração atual para os quizzes novos.

## Funcionalidades

**Edição**

- Grelha de temas por perguntas, com avisos do que falta: perguntas vazias, respostas por verificar, regras de etiquetas por cumprir e repetições.
- Etiquetas em cada pergunta (por exemplo, «Porto»), usadas pelas regras de verificação.
- Tipos de pergunta: resposta aberta, escolha múltipla e correspondência (A-2, B-1…).
- Imagem, áudio ou vídeo em cada pergunta, a partir de um ficheiro ou de um URL (incluindo YouTube).
- «Imagem por definir»: reserva o espaço da imagem no slide, e o PowerPoint leva uma imagem provisória para substituir depois (botão direito › Alterar Imagem).
- Perguntas de 1 ou 2 pontos, dificuldade, notas e fonte.
- Interface ao estilo do [BoldKit](https://boldkit.dev) (neubrutalismo), com as 14 paletas do BoldKit à escolha no botão 🎨, e modo claro, escuro ou automático. A letra é a Outfit, carregada do Google Fonts. Sem ligação, a interface usa a letra do sistema.

**Banco de perguntas**

- Base de exemplo com 190 perguntas, pesquisável por texto, tema e estado.
- Pergunta aleatória no editor, com pré-visualização e opção de desfazer.
- Preenchimento do quiz inteiro, com mistura equilibrada de dificuldades.
- Arquivo de quizzes já feitos: as perguntas ficam marcadas como usadas, e a aplicação avisa quando uma pergunta é igual ou parecida com outra já usada.

**Ordem das perguntas**

- Por tema (uma ronda por tema) ou misturada, com o número de rondas à escolha.
- Baralhar segundo a regra de repetição de temas configurada.
- Vista «Ordem do quiz», onde se arrastam as perguntas para outra posição.

**Exportação**

- **PowerPoint**, com as respostas depois de cada ronda, todas no fim ou sem respostas. A resposta, as notas e a fonte ficam nas notas do apresentador.
- **Só respostas**, em PowerPoint: cada pergunta aparece em dois slides, primeiro a pergunta e depois só a resposta, em destaque.
- **Guião do apresentador**, em Markdown.
- **Slides Marp**, em Markdown.
- **JSON**, para guardar e voltar a importar o quiz.

## Templates de PowerPoint

| Template | Aspeto | Tipos de letra |
|---|---|---|
| Atlântico | Azul-noite e areia, sóbrio e editorial | Palatino Linotype, Segoe UI |
| Néon | Letreiro magenta e ciano sobre preto | Bahnschrift |
| Laurissilva | Verde-floresta com curvas de nível | Constantia, Corbel |
| Constelação | Céu violeta com estrelas | Century Gothic |
| Vinil | Anos 70, faixas curvas e letra redonda | Cooper Black, Century Gothic |
| Fado | Preto e carmim, com as cordas da guitarra | Palatino Linotype |
| Madrugada | O céu antes do nascer do sol | Palatino Linotype |
| Metro | Cada tema é uma linha, cada pergunta uma estação | Bahnschrift |
| Vitral | Painel de vitral sobre preto | Gill Sans MT |
| Confetes | Anos 80, rabiscos e sombras duras | Century Gothic |
| Aurora | Aurora boreal sobre noite profunda | Century Gothic |

O PowerPoint não embute estas fontes no ficheiro, por isso o computador que projeta tem de as ter. Palatino Linotype, Segoe UI, Bahnschrift, Constantia e Corbel vêm com o Windows. Gill Sans MT, Century Gothic e Cooper Black vêm com o Microsoft Office. Sem elas, o PowerPoint substitui a letra e o aspeto muda.

## Como usar

A aplicação não precisa de instalação nem de compilação. Basta servir a pasta do projeto:

```bash
python -m http.server 8765
```

Depois, abre `http://localhost:8765` no browser. Também pode ser publicada em qualquer alojamento estático, como o GitHub Pages.

É preciso ligação à internet para exportar em PowerPoint, porque a biblioteca [PptxGenJS](https://github.com/gitbrent/PptxGenJS) é carregada de um CDN. O resto da aplicação funciona sem ligação.

> **Cópias de segurança.** Os dados ficam no IndexedDB do browser, e limpar os dados do browser apaga-os. Exporta regularmente o quiz e o banco em JSON. Os ficheiros de áudio e vídeo ficam embutidos no JSON, que pode tornar-se pesado.

## Base de perguntas

| Tema | Perguntas |
|---|---|
| Aproximação | 5 |
| Madeira | 5 |
| Guilhotina | 5 |
| História | 25 |
| Ciências Exatas | 25 |
| Desporto e Jogos | 25 |
| Música, Cinema e TV | 25 |
| Arte e Design | 25 |
| Literatura, Filosofia e Ciências Sociais | 25 |
| Locais e Geografia | 25 |
| Atualidade | 0 |

Esta base é uma amostra, para experimentar a aplicação. Chega para preencher um quiz de qualquer tamanho nos temas com perguntas, mas não dá para vários quizzes sem repetir. Para uso regular, acrescenta as tuas perguntas.

As perguntas foram geradas com inteligência artificial e estão todas marcadas como «por verificar». Podem conter erros factuais, por isso confirma as respostas antes de as usares.

Atualidade não tem perguntas na base, porque envelhecem depressa. Estas perguntas devem ser escritas para cada quiz.

### Acrescentar perguntas

1. Junta ficheiros JSON a `banco/fontes/`, seguindo o formato de [banco/INSTRUCOES.md](banco/INSTRUCOES.md).
2. Gera de novo a base:

   ```bash
   python tools/build_base.py
   ```

O script valida as perguntas e remove as repetidas e as quase repetidas. Quando a aplicação abre e encontra uma versão nova da base, junta ao banco as perguntas novas e não toca nas que foram editadas ou usadas.

## Estrutura do projeto

```text
index.html            Página da aplicação
style.css             Estilos, com modo claro e escuro
js/
  model.js            Modelo do quiz, ordem das perguntas e normalização
  db.js               Armazenamento em IndexedDB
  bank.js             Banco de perguntas e pergunta aleatória
  arrange.js          Vistas, baralhar, preencher e desfazer
  config.js           Separador «Configurar» e predefinição dos quizzes novos
  templates.js        Templates e geração dos slides
  export.js           Exportações em PowerPoint e Markdown
  app.js              Grelha, editor e arranque
banco/
  fontes/             Perguntas em JSON, por tema
  base.js             Base gerada a partir de fontes/ (não editar à mão)
  INSTRUCOES.md       Formato das perguntas e regras de qualidade
tools/build_base.py   Valida as fontes e gera banco/base.js
exemplos/             Quiz de exemplo para importar
```

O projeto é escrito em JavaScript simples, sem dependências para instalar. O Python só é necessário para gerar a base e para o servidor local.
