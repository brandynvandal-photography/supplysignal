/* A clock. Everything it shows is true, which is the only claim this page
   makes — see the note in index.html for why it is not a weather report. */
(function () {
  var t = document.getElementById("t");
  var d = document.getElementById("d");
  function paint() {
    var now = new Date();
    t.textContent = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    d.textContent = now.toLocaleDateString(undefined,
      { weekday: "long", month: "long", day: "numeric" });
  }
  paint();
  setInterval(paint, 15000);
})();
