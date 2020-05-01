const game = new PIXI.Application({width: 1280, height: 720});
var saveResources = null;
document.body.appendChild(game.view);

var players = [];

var inqueue = 0;
var ingame = 0;

var container, message, stats;

function ApplySettings(){
  game.renderer.backgroundColor = 0x212121;
  PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
}

PIXI.loader
    .add("images/shiba.json")
    .load(setup);


function setup() {
  let sheet = PIXI.loader.resources["images/shiba.json"];
  const shiba = new PIXI.AnimatedSprite(sheet.spritesheet.animations["idle"]);
  shiba.width = -128;
  shiba.height = 128;
  shiba.anchor.x = 0.5;
  shiba.anchor.y = 0.5;
  shiba.x = game.renderer.width - 64;
  shiba.y = game.renderer.height - 56;
  shiba.animationSpeed = 0.167;
  shiba.play();
  game.stage.addChild(shiba);
}

function Init(){
  message.style["fontFamily"] = stats.style["fontFamily"] = 'Unifont';
  stats.text = "Загрузка..."

  var script = document.createElement('script');
  script.src = 'ws.js';
  document.head.appendChild(script);
}

function LoadAssets(){
  game.loader.add('checker', 'images/checker.png');
  game.loader.add('table', 'images/table_num.png');
  game.loader.add('images/shiba.json');

  container = new PIXI.Container();
  container.x = 0;
  container.y = 0;
  container.width = 720;
  container.height = 720;
  game.stage.addChild(container);

  game.loader.load((loader, resources) => {
      saveResources = resources;

      // TABLE
      const table = new PIXI.Sprite(resources.table.texture);
      table.scale.x = 2.25;
      table.scale.y = 2.25;
      container.addChild(table);
      // game.ticker.add(() => {
      //     shiba.rotation += 0.02;
      // });
  });
}

document.addEventListener('DOMContentLoaded', function(){
  LoadAssets();
  ApplySettings();

  message = new PIXI.Text('',{fontFamily : 'Unifont', fontSize: 36, fill : 0xffffff, align : 'center'});
  message.x = 1000;
  message.y = 360;
  message.anchor.x = 0.5;
  message.anchor.y = 0.5;
  game.stage.addChild(message);

  stats = new PIXI.Text('',{fontFamily : 'Unifont', fontSize: 24, fill : 0xffffff, align : 'right'});
  stats.x = game.renderer.width - 132;
  stats.y = game.renderer.height - 48;
  stats.anchor.x = 1;
  stats.anchor.y = 0.5;
  game.stage.addChild(stats);
});
