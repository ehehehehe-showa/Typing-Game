/* ==========================================
   layout.js — #app-shellの表示スケーリング
   #app-shellは常にSHELL_WIDTH x SHELL_HEIGHTの固定サイズを持つ「窓」として扱う。
   実際のブラウザウィンドウがそれより大きくても小さくても、シェル内部の
   レイアウト(要素の折り返しや配置)そのものは一切変えず、transform: scale()で
   均一に拡大縮小するだけにすることで、ウィンドウサイズによって表示内容の
   見え方が変わる(レスポンシブ折り返し等)ことそのものをなくす。
========================================== */

const SHELL_WIDTH = 1100;
const SHELL_HEIGHT = 760;

function updateShellScale() {
    const shell = document.getElementById('app-shell');
    if (!shell) return;
    const scale = Math.min(window.innerWidth / SHELL_WIDTH, window.innerHeight / SHELL_HEIGHT);
    shell.style.transform = `scale(${scale})`;
}

function initLayout() {
    updateShellScale();
    window.addEventListener('resize', updateShellScale);
}
