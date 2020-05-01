const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const VkBot = require('node-vk-bot-api');
const Markup = require('node-vk-bot-api/lib/markup');
const VkApi = require('node-vk-bot-api/lib/api');
const WebSocket = require('ws');
const request = require('request');
const atob = require('atob');
const fs = require('fs');
const FormData = require('form-data');
const Blob = require('cross-blob')
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const wss = new WebSocket.Server({port: 90});

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const STREAM_LINK = ''; // e.g. https://www.youtube.com/watch?v=xxxxxxxxxxx

var teams = [[],[]]; // Двумерный массив [[id1, id2, ..], [id3, id4, ..]].
var playersQueue = []; // Массив [id1, id2, ..].
var queueTimeout, queueInterval; // Таймер.

var turnPlayerNumber = 0; // Целое значение.
var turnTeamNumber = null; // Целое значение: 0, 1.
var turnPlayerNumbers = [null, null]; // Массив: [Целое, Целое].
var lastTurn = null; // Массив: [x, y].
var turnType = null; // Строка: "move", "cut".
var gameState = 0; // Целые значения: 0 (Ожидание игроков), 1 (Подготовка к игре), 2 (Игра запущена).
var checkers = null; // Массив, получаемый от клиента.
var screenshot = null; // Строка base64.

const letters = { "a":0, "b":1, "c":2, "d":3, "e":4, "f":5, "g":6, "h":7 };
const numbers = { "1":7, "2":6, "3":5, "4":4, "5":3, "6":2, "7":1, "8":0 };

const bot = new VkBot({token: ACCESS_TOKEN, confirmation: "221167b7"});

const botApp = express();
botApp.use(cors());
botApp.use(bodyParser.json());
botApp.post('/ytbot', bot.webhookCallback);
botApp.listen(80);

wss.on('connection', function connection(ws) {
  ws.send('{"chat":"Поиск игроков..."}');
  ws.send(JSON.stringify({"stats" : JSON.stringify([playersQueue.length, teams[0].length + teams[1].length])}));
  bot.command('Начать', (ctx) => {
    ctx.reply('Привет!\nЧтобы записаться на игру нажмите кнопку "Записаться"\n'+
              'Чтобы получить ссылку на трансляцию с игрой, нажмите кнопку "Трансляция"', null, Markup
            .keyboard([
              'Записаться',
              'Трансляция',
            ]).oneTime());

    ws.send(JSON.stringify(ctx.message));
  });

  bot.command('Записаться', (ctx) => {
    VkApi('users.get', {
      user_ids: ctx.message["user_id"],
      fields: "photo_100",
      access_token: ACCESS_TOKEN,
    }).then(function(data){
      const userdata = data.response[0];

      if (userdata == undefined)
        return ctx.reply('Не получилось добавить вас в очередь :/');

      const id = userdata.id;
      const full_name = userdata.first_name + ' ' + userdata.last_name;
      const photo = userdata.photo_100;

      if (playersQueue !== []){
        for (var i = 0; i < playersQueue.length; i++) {
          if (playersQueue[i][0] == id){
            return ctx.reply('Вы уже находитесь в очереди! Ваша позиция: ' + (i + 1));
          }
        }
      }

      playersQueue.push([id, full_name, photo]);
      ctx.reply(`⌛ Вы были добавлены в очередь!\nВаша позиция: ${playersQueue.length}\nДля игры необходимо от ${MIN_PLAYERS} до ${MAX_PLAYERS} участников.\nЧтобы выйти из очереди, напишите "Вычеркнуть"`);
      ws.send(JSON.stringify({"stats" : JSON.stringify([playersQueue.length, teams[0].length + teams[1].length])}));
      ws.send(JSON.stringify(ctx.message));

      if (playersQueue.length >= MIN_PLAYERS){
        if (!queueTimeout) {
          var queueTimer = 5;
          queueInterval = setInterval(function(){
            queueTimer--;
            ws.send(JSON.stringify({"chat" : `Старт через ${queueTimer}c.`, "stats" : JSON.stringify([playersQueue.length, teams[0].length + teams[1].length])}));
          }, 1000);
          queueTimeout = setTimeout(function(){
            StartGame();
            SwitchTurn();
            clearInterval(queueTimeout);
            clearInterval(queueInterval);
          }, queueTimer * 1000);
        }
      }
    });
  });

  bot.command('Трансляция', (ctx) => {
    if (STREAM_LINK && STREAM_LINK !== '')
      ctx.reply(STREAM_LINK);
  });

  bot.command('Вычеркнуть', (ctx) => {
    for (var i = 0; i < playersQueue.length; i++) {
      if (playersQueue[i][0] == ctx.message["user_id"]){
        if (i < MAX_PLAYERS && queueTimeout !== undefined) return ctx.reply('Нельзя выйти из очереди, вы участвуете в следующей игре.');

        playersQueue.splice(i, 1);
        ws.send(JSON.stringify({"stats" : JSON.stringify([playersQueue.length, teams[0].length + teams[1].length])}));
        return ctx.reply('Вы больше не в очереди.');
      }
    }

    return ctx.reply('Вас нет в очереди на игру.');
  });

  bot.command('Удариться', (ctx) => {
    ctx.reply('Я тебя щас сам ударю');
  });

  bot.on((ctx) => {
    if (ctx.message.body.match(/[a-h0-8][a-h0-8]/gmi)){
      if (ctx.message.user_id == teams[turnTeamNumber][turnPlayerNumbers[turnTeamNumber]][0]){
        var command = ReforgeTurn(ctx.message.body.toLowerCase());

        // Проверка на правильность написания команды.
        if (command.length != 4)
          return ctx.reply('Ошибка в команде. Примеры верной формы записи: A1-B2, A1 B2, A1:B2');

        // Проверка на наличие информации о поле.
        if (!checkers)
          return ctx.reply('Поле еще не готово. Повторите попытку.');

        // Проверка на наличие шашки в начальной ячейке.
        if(checkers[command[0]][command[1]] !== turnTeamNumber && checkers[command[0]][command[1]] !== turnTeamNumber + 2)
          return ctx.reply('В этой ячейке нет вашей шашки.');

        // Проверка на отсутствие шашки в конечной ячейке.
        if (checkers[command[2]][command[3]] !== -1)
          return ctx.reply('В конечной ячейке находится шашка.');

        // Рассчет возможных ходов
        var possibleTurns = PossibleTurns(checkers);
        var possibleCheckers;

        // Проверка на возможность срубить шашку.
        if (possibleTurns.hasOwnProperty("cuts")){
          turnType = "cut";
          possibleCheckers = possibleTurns.cuts;
        } else if (possibleTurns.hasOwnProperty("moves")){
          turnType = "move";
          possibleCheckers = possibleTurns.moves;
        }

        for (var key in possibleCheckers){
          if (key == command[0] + "," + command[1]){
            var possibles = possibleCheckers[key];
            for (var i = 0; i < possibles.length; i++) {
              if (command[2] == possibles[i][0] && command[3] == possibles[i][1]){
                lastTurn = [command[2], command[3]];
                return ws.send(JSON.stringify({"request" : '["doTurn"]', "command" : JSON.stringify(command)}));
              }
            }
            if (turnType == "cut") return ctx.reply('Вы обязаны срубить шашку.');
          }
        }

        return ctx.reply('Нельзя так сходить.');
      } else {
        ctx.reply('Сейчас не ваш ход.');
      }
    }
  })

  ws.onmessage = function(event) {
    var json = JSON.parse(event.data);
    if (json.getTable) checkers = JSON.parse(json.getTable);
    if (json.screenshot) screenshot = json.screenshot;
    if (json.doTurn) DoTurn(JSON.parse(json.doTurn));
    if (json.callback) DoCallback(json.callback);
  };

  function isAlly(value){
    if (value == turnTeamNumber || value == turnTeamNumber + 2)
      return true;
    else
      return false;
  }

  function isEmpty(value){
    if (value == -1)
      return true;
    else
      return false;
  }

  function PossibleTurns(table){
    var movePossibles = {};
    var cutPossibles = {};
    var possibleDeltaY = 0;

    if (turnTeamNumber == 0)
      possibleDeltaY = -1;
    else
      possibleDeltaY = 1;

    for (var x = 0; x < table.length; x++) {
      for (var y = 0; y < table[x].length; y++) {
        var cuts = [];
        var moves = [];

        if (lastTurn !== null && (x !== lastTurn[0] || y !== lastTurn[1])) continue;

        // РАСЧЁТ ВОЗМОЖНЫХ ХОДОВ ШАШЕК
        if (table[x][y] == turnTeamNumber){
          // ХОД ВПЕРЕД НАЛЕВО
          if (x > 0){
            if (isEmpty(table[x - 1][y + possibleDeltaY]))
              moves.push([x - 1, y + possibleDeltaY]);
            else if ((x > 1) && (isEmpty(table[x - 2][y + possibleDeltaY * 2])) && !isAlly(table[x - 1][y + possibleDeltaY]) && !isEmpty(table[x - 1][y + possibleDeltaY])){
              cuts.push([x - 2, y + possibleDeltaY * 2]);
            }
          }
          // СРУБИТЬ НАЗАД НАЛЕВО
          if (x > 1){
            if ((isEmpty(table[x - 2][y - possibleDeltaY * 2])) && !isAlly(table[x - 1][y - possibleDeltaY]) && !isEmpty(table[x - 1][y - possibleDeltaY])){
              cuts.push([x - 2, y - possibleDeltaY * 2]);
            }
          }
          // ХОД ВПЕРЕД НАПРАВО
          if (x < 7){
            if (isEmpty(table[x + 1][y + possibleDeltaY]))
              moves.push([x + 1, y + possibleDeltaY]);
            else if ((x < 6) && isEmpty(table[x + 2][y + possibleDeltaY * 2]) && !isAlly(table[x + 1][y + possibleDeltaY]) && !isEmpty(table[x + 1][y + possibleDeltaY]))
              cuts.push([x + 2, y + possibleDeltaY * 2]);
          }
          // СРУБИТЬ НАЗАД НАПРАВО
          if (x < 6){
            if (isEmpty(table[x + 2][y - possibleDeltaY * 2]) && !isAlly(table[x + 1][y - possibleDeltaY]) && !isEmpty(table[x + 1][y - possibleDeltaY]))
              cuts.push([x + 2, y - possibleDeltaY * 2]);
          }
        // РАСЧЁТ ВОЗМОЖНЫХ ХОДОВ ДАМОК
        } else if (table[x][y] == (turnTeamNumber + 2)){
          // ХОД ВПЕРЕД НАЛЕВО
          for (var i = 0; i < 4; i++) {
            var pathX = x;
            var pathY = y;
            var hasCut = false;

            var deltaX = 0;
            var deltaY = 0;

            if (i == 0){
              deltaX = 1;
              deltaY = 1;
            }
            if (i == 1){
              deltaX = 1;
              deltaY = -1;
            }
            if (i == 2){
              deltaX = -1;
              deltaY = 1;
            }
            if (i == 3){
              deltaX = -1;
              deltaY = -1;
            }

            while (pathX >= 0 && pathX <= 7 && pathY >= 0 && pathY <= 7) {
              pathX += deltaX;
              pathY += deltaY;

              if (pathX < 0 || pathX > 7 || pathY < 0 || pathY > 7) break;

              if (isEmpty(table[pathX][pathY])){
                if (hasCut)
                  cuts.push([pathX, pathY]);
                else
                  moves.push([pathX, pathY]);

              } else if (isAlly(table[pathX][pathY])){
                break;
              } else {
                if (hasCut) break;
                hasCut = true;
              }
            }
          }
        }

        if (cuts.length > 0){
          cutPossibles[x + "," + y] = cuts;
        } else if (moves.length > 0) {
          movePossibles[x + "," + y] = moves;
        }
      }
    }

    if (Object.keys(cutPossibles).length > 0){
      return {"cuts" : cutPossibles};
    }
    else if (Object.keys(movePossibles).length > 0){
      return {"moves" : movePossibles};
    } else {
      return {"end" : "NO_MOVES"};
    }
  }

  function RestartGame(){
    teams = [[],[]];
    queueTimeout = undefined;
    queueInterval = undefined;

    turnPlayerNumber = 0;
    turnTeamNumber = null;
    turnPlayerNumbers = [null, null]
    turnType = null;
    gameState = 0;

    checkers = null;

    ws.send('{"chat":"Поиск игроков..."}');
    ws.send(JSON.stringify({"stats" : JSON.stringify([playersQueue.length, teams[0].length + teams[1].length])}));
  }

  function DoTurn(table){
    if (lastTurn !== null && turnType == "cut" && PossibleTurns(table).hasOwnProperty("cuts")){
      ContinueTurn();
    } else {
      bot.execute('messages.send', {
        user_id: teams[turnTeamNumber][turnPlayerNumbers[turnTeamNumber]][0],
        random_id: new Date().getTime(),
        message: 'Ход сделан.'
      });
      SwitchTurn();
    }
  }

  function StartGame(){
    gameState = 1;

    var i = 0;
    while (teams[0].length + teams[1].length < MAX_PLAYERS && playersQueue.length > 0){
      if (i % 2 == 0) teams[0].push(playersQueue.shift());
      else teams[1].push(playersQueue.shift());
      i++;
    }

    for (var i = 0; i < teams.length; i++) {
      for (var j = 0; j < teams[i].length; j++) {
        var flag, team;
        if (i == 0){
          flag = "🏳️";
          team = "белую";
        } else {
          flag = "🏴";
          team = "чёрную";
        }
        bot.execute('messages.send', {
          user_id: teams[i][j][0],
          random_id: new Date().getTime(),
          message: `${flag} Вы играете за ${team} команду!`
        })
      }
    }
    ws.send(JSON.stringify({"request" : '["initPlayers"]', "teams" : JSON.stringify(teams)}));
    ws.send(JSON.stringify({"game_state" : gameState, "chat" : "Игра началась!"}));
    ws.send(JSON.stringify({"stats" : JSON.stringify([playersQueue.length, teams[0].length + teams[1].length])}));
  }

  function ReforgeTurn(string){
    var command = [];

    for (var i = 0; i < string.length; i++) {
      if (letters.hasOwnProperty(string.charAt(i)))
        command.push(letters[string.charAt(i)])
      else if (numbers.hasOwnProperty(string.charAt(i)))
        command.push(numbers[string.charAt(i)])
    }

    return command;
  }

  function TurnToCommand(arr){
    var turn = '';
    var seperator = '-';

    if (checkers){
      var x = arr[0], y = arr[1];
      var signX = Math.sign(arr[2] - arr[0]);
      var signY = Math.sign(arr[3] - arr[1]);

      loop1: while (x !== arr[2]){
        x += signX;
        loop2: while (y !== arr[3]){
          y += signY;
          if (checkers[x][y] !== -1){
            seperator = ':';
            break loop1;
            break loop2;
          }
        }
      }
    }

    loop1: for (var i = 0; i < arr.length; i++) {
      if (i % 2){
        for (var key in numbers){
          if (numbers[key] == arr[i]){
            turn += key;
            continue loop1;
          }
        }
      }
      else {
        for (var key in letters){
          if (letters[key] == arr[i]){
            turn += key.toUpperCase();
            continue loop1;
          }
        }
      }
    }

    var result = turn.slice(0, 2) + seperator + turn.slice(2, 4);

    return result;
  }

  function BuildTurnsKeyboard(){
    var buttons = [];
    var possibleTurns = PossibleTurns(checkers);
    var possibleCheckers;

    if (possibleTurns.hasOwnProperty("cuts"))
      possibleCheckers = possibleTurns.cuts;
    else if (possibleTurns.hasOwnProperty("moves"))
      possibleCheckers = possibleTurns.moves;

    for (var key in possibleCheckers){
      if (possibleCheckers[key].length > 0){
        for (var i = 0; i < possibleCheckers[key].length; i++) {
          var command = TurnToCommand([parseInt(key.charAt(0), 10), parseInt(key.charAt(2), 10)].concat(possibleCheckers[key][i]));
          buttons.push(command);
        }
      }
    }

    return buttons;
  }

  function dataURItoBlob(dataURI) {
    var byteString;
    if (dataURI.split(',')[0].indexOf('base64') >= 0)
        byteString = atob(dataURI.split(',')[1]);
    else
        byteString = unescape(dataURI.split(',')[1]);

    var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

    var ia = new Uint8Array(byteString.length);
    for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    return new Blob([ia], {type:mimeString});
  }

  function send_photo (base64, url){
    var data = base64.replace(/^data:image\/png;base64,/, "");

    fs.writeFile("screenshot.png", data, 'base64', function(err) {
      if (err) console.error(err);

      const options = {
          method: "POST",
          url: url,
          headers: {
              "Content-Type": "multipart/form-data"
          },
          formData : {
              "photo" : fs.createReadStream("screenshot.png")
          }
      };

      request(options, function (err, res, body) {
          if (err) console.error(err);
          var bodyObj = JSON.parse(body);

          bot.execute('photos.saveMessagesPhoto', {
            photo: bodyObj.photo,
            server: bodyObj.server,
            hash: bodyObj.hash
          }).then(function(res){
            bot.execute('messages.send', {
              user_id: teams[turnTeamNumber][turnPlayerNumbers[turnTeamNumber]][0],
              random_id: new Date().getTime(),
              message: '',
              attachment: `photo${res[0].owner_id}_${res[0].id}`
            })
          }).catch(function(err){
            if (err) console.error(err);
          });
      });
    });
   }

  function DoCallback(callback){
    switch (callback){
      case "SwitchTurnMessage":
        bot.execute('photos.getMessagesUploadServer', {
          user_id: teams[turnTeamNumber][turnPlayerNumbers[turnTeamNumber]][0],
        }).then(function(res){
          send_photo(screenshot, res['upload_url']);
        });
        var possibleTurns = PossibleTurns(checkers);
        if (possibleTurns.hasOwnProperty("moves") || possibleTurns.hasOwnProperty("cuts")){
          bot.execute('messages.send', {
            user_id: teams[turnTeamNumber][turnPlayerNumbers[turnTeamNumber]][0],
            random_id: new Date().getTime(),
            message: '♟️ Ваш ход!\nВыберите доступную шашку и укажите конечную точку.\nНапример: A1-B2',
            keyboard: Markup.keyboard(BuildTurnsKeyboard()).oneTime()
          })
        } else {
          for (var i = 0; i < teams[turnTeamNumber].length; i++) {
            bot.execute('messages.send', {
              user_id: teams[turnTeamNumber][i][0],
              random_id: new Date().getTime(),
              message: '💥Вы проиграли :(',
              keyboard: Markup.keyboard(BuildTurnsKeyboard()).oneTime()
            })
          }
          for (var i = 0; i < teams[1 - turnTeamNumber].length; i++) {
            bot.execute('messages.send', {
              user_id: teams[1 - turnTeamNumber][i][0],
              random_id: new Date().getTime(),
              message: '🔥Вы победили!',
              keyboard: Markup.keyboard(BuildTurnsKeyboard()).oneTime()
            })
          }
          var flag, team;
          if (turnTeamNumber == 1){
            flag = "🏳️";
            team = "белая";
          } else {
            flag = "🏴";
            team = "чёрная";
          }
          ws.send(JSON.stringify({"chat" : `${flag}Игра окончена!\nПобедила ${team} команда`}));
          setTimeout(function(){
              ws.send(JSON.stringify({"request":'["restartGame"]'}));
              RestartGame();
            }, 5000)
        }
        break;
        case "ContinueTurnMessage":
          bot.execute('messages.send', {
            user_id: teams[turnTeamNumber][turnPlayerNumbers[turnTeamNumber]][0],
            random_id: new Date().getTime(),
            message: 'Продолжайте ход.',
            keyboard: Markup.keyboard(BuildTurnsKeyboard()).oneTime()
          })
          break;
    }
  }

  function SwitchTurn(){
    turnType = null;
    checkers = null;
    lastTurn = null;

    if (turnTeamNumber == null ){
      turnTeamNumber = 0;
    } else {
      turnTeamNumber = 1 - turnTeamNumber;
    }

    if (turnPlayerNumbers[turnTeamNumber]  == null ){
      turnPlayerNumbers[turnTeamNumber] = 0;
    } else {
      turnPlayerNumbers[turnTeamNumber]++;
    }

    if (turnPlayerNumbers[turnTeamNumber] >= (teams[turnTeamNumber].length))
      turnPlayerNumbers[turnTeamNumber] = 0;

    var flag, team;
    if (turnTeamNumber == 0){
      flag = "🏳️";
      team = "белой";
    } else {
      flag = "🏴";
      team = "чёрной";
    }
    ws.send(JSON.stringify({"chat" : `Ходит игрок ${team} команды\n${flag}${teams[turnTeamNumber][turnPlayerNumbers[turnTeamNumber]][1]}`, "request" : '["switchTurn"]', "id" : teams[turnTeamNumber][turnPlayerNumbers[turnTeamNumber]][0].toString()}));
    ws.send(JSON.stringify({"request" : '["getTable", "screenshot"]', "callback" : "SwitchTurnMessage"}));
  }

  function ContinueTurn(){
    checkers = null;
    ws.send(JSON.stringify({"request" : '["getTable"]', "callback" : "ContinueTurnMessage"}));
  }
});
