module.exports = {
	globDirectory: 'dist/client/',
	globPatterns: ['**/*.{js,css,html,ico,png,svg,xml,webmanifest}'],
	swDest: 'dist/client/sw.js',
	navigateFallback: '_shell.html',
	clientsClaim: true,
	skipWaiting: true,
}
