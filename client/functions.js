function createArray(length) {
    var arr = new Array(length || 0),
        i = length;

    if (arguments.length > 1) {
        var args = Array.prototype.slice.call(arguments, 1);
        while(i--) arr[length-1 - i] = createArray.apply(this, args);
    }

    return arr;
}

function removeArrZ(arr, z) {
  var result = copyArray(arr);
  for (var x = 0; x < arr.length; x++) {
    for (var y = 0; y < arr[x].length; y++) {
      result[x][y] = arr[x][y][z];
    }
  }
  return result;
}

function copyArray(arr){
  var result = [];
  for (var i = 0; i < arr.length; i++)
    result[i] = arr[i].slice();
  return result;
}
