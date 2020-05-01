const ws = new WebSocket("ws://localhost:90");

ws.onmessage = function(event) {
  var json = JSON.parse(event.data);
  if (json.chat) message.text = json.chat;
  if (json.stats) {
    inqueue = JSON.parse(json.stats)[0];
    ingame = JSON.parse(json.stats)[1];
    stats.text = `В игре: ${ingame}\nВ очереди: ${inqueue}`;
  }

  if (json.request) {
    for (var i = 0; i < JSON.parse(json.request).length; i++) {
      var request = JSON.parse(json.request)[i];
      if (request == "getTable"){
        var newarr = JSON.stringify(window.removeArrZ(checkers, 1));
        ws.send(JSON.stringify({"getTable" : newarr, "callback":json.callback}));
      }
      if (request == "switchTurn"){
        var id = json.id;
        for (var i = 0; i < players.length; i++) {
          var  sprite = players[i][0];
          if (players[i][1][0] == id){
            sprite.width = 96;
            sprite.height = 96;
            sprite.alpha = 1;
          } else {
            sprite.width = 72;
            sprite.height = 72;
            sprite.alpha = 0.7;
          }
        }
      }
      if (request == "doTurn"){
        var command = JSON.parse(json.command);
        var deltaX = Math.sign(command[2] - command[0]);
        var deltaY = Math.sign(command[3] - command[1]);
        var x = command[0];
        var y = command[1];

        while (x !== command[2]){
          x += deltaX;
          y += deltaY;

          if ((checkers[x][y][1] !== checkers[command[0]][command[1]][1]) && (checkers[x][y][1] !== checkers[command[0]][command[1]][1] + 2)){
            container.removeChild(checkers[x][y][0]);
            checkers[x][y] = [, -1];
          }
        }

        checkers[command[2]][command[3]] = checkers[command[0]][command[1]];
        checkers[command[2]][command[3]][0].x = 32*2.25 + 32*2.25 * command[2];
        checkers[command[2]][command[3]][0].y = 32*2.25 + 32*2.25 * command[3];
        checkers[command[0]][command[1]] = [, -1];

        // Превращение в дамки: Белые
        if (checkers[command[2]][command[3]][1] == 0){
          if (command[3] == 0){
            checkers[command[2]][command[3]][1] = 2;
            checkers[command[2]][command[3]][0].texture = checkerFrames[2];
          }
        }
        // Превращение в дамки: Черные
        if (checkers[command[2]][command[3]][1] == 1){
          if (command[3] == 7){
            checkers[command[2]][command[3]][1] = 3;
            checkers[command[2]][command[3]][0].texture = checkerFrames[3];
          }
        }

        newarr = JSON.stringify(window.removeArrZ(checkers, 1));
        ws.send(JSON.stringify({"doTurn":newarr}));
      };
      if (request == "restartGame"){
        clearCheckers();

        for (var i = 0; i < players.length; i++) {
          if (players[i][0]){
            game.stage.removeChild(players[i][0]);
          }
        }
        players = [];
      }
      if (request == "initPlayers"){
        initCheckers();
        var playerPhotos = [];
        var user = null;
        var teams = JSON.parse(json.teams);
        for (var teamID = 0; teamID < teams.length; teamID++){
          for (var playerID = 0; playerID < teams[teamID].length; playerID++){
            user = teams[teamID][playerID];
            playerPhotos.push([new Image(), null, null]);
            var curPhoto = playerPhotos[playerPhotos.length - 1]
            curPhoto[0].crossOrigin = "anonymous";
            curPhoto[0].width = 96;
            curPhoto[0].height = 96;

            if (user[2].search("vk.com") == -1)
              curPhoto[0].src = user[2];
            else
              curPhoto[0].src = "/images/camera_100.png";

            curPhoto[1] = new PIXI.BaseTexture(curPhoto[0]);
            curPhoto[2] = new PIXI.Texture(curPhoto[1]);
            players.push([new PIXI.Sprite(curPhoto[2]), user]);
            players[players.length-1][0].x = (820 + playerID * 128);
            players[players.length-1][0].y = (180 + (( 1 - teamID) * 360));
            players[players.length-1][0].anchor.x = 0.5;
            players[players.length-1][0].anchor.y = 0.5;
            game.stage.addChild(players[players.length-1][0]);
          }
        }
      }
      if (request == "screenshot"){
        game.render();
        const image = game.renderer.plugins.extract.image(container);
        ws.send(JSON.stringify({"screenshot" : image.src}));
      }
    }
  }
};
