var checkers = null;
const checkerSpriteSheet = [
  new PIXI.Rectangle(32, 32, 32, 32),   //Белая шашка     ID=0
  new PIXI.Rectangle(0, 32, 32, 32),    //Черная шашка    ID=1
  new PIXI.Rectangle(32, 0, 32, 32),    //Белая дамка     ID=2
  new PIXI.Rectangle(0, 0, 32, 32),     //Черная дамка    ID=3
];
const checkerFrames = [];

function clearCheckers(){
  if (checkers !== null){
    for (var x = 0; x < checkers.length; x++) {
      for (var y = 0; y < checkers.length; y++) {
        container.removeChild(checkers[x][y][0]);
      }
    }
  }

  for (var i = 0; i < checkerSpriteSheet.length; i++) {
    checkerFrames[i] = new PIXI.Texture(saveResources.checker.texture, checkerSpriteSheet[i]);
  }
}

function initCheckers(){
  clearCheckers();

  checkers = createArray(8, 8, 2);
  for (var i = 0; i <= 1; i++) {
    var starty, endy;

    if (i == 0){
      starty = 0;
      endy = 2;
    } else if (i == 1){
      starty = 5;
      endy = 7;
    }
    for (var y = starty; y <= endy; y ++) {
      for (var x = 1 - (y % 2); x < 8; x += 2) {
        var id = 1 - i;
        checkers[x][y][0] = new PIXI.Sprite(checkerFrames[id]);
        checkers[x][y][0].texture = checkerFrames[id];
        checkers[x][y][0].scale.x = 2.25;
        checkers[x][y][0].scale.y = 2.25;
        checkers[x][y][0].x = 32*2.25 + 32*2.25 * x;
        checkers[x][y][0].y = 32*2.25 + 32*2.25 * y;
        checkers[x][y][1] = id;

        container.addChild(checkers[x][y][0]);
      }
    }
  }

  for (var x = 0; x < 8; x ++) {
    for (var y = 0; y < 8; y ++) {
      if (typeof checkers[x][y][1] == 'undefined') checkers[x][y][1] = -1;
    }
  }
}
