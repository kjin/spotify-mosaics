const inlineUrlescape = require('inline-urlescape')
const Koa = require('koa')
const route = require('koa-route')
const SpotifyWebApi = require('spotify-web-api-node')

const scopes = ['playlist-read-private']
const secret = Date.now().toString()
const MAX_PLAYLISTS_PER_QUERY = 50
const MAX_TRACKS_PER_QUERY = 100

const htmlPrefix = '<html><head><title>My App</title></head><body>'
const htmlSuffix = '</body></html>'

const spotify = new SpotifyWebApi({
  clientId: require('./client_id.json'),
  clientSecret: require('./client_secret.json'),
  redirectUri: inlineUrlescape('http://localhost:8000/authenticated')
})

// Koa application
const app = new Koa()

app.use(route.get('/', async (ctx, next) => {
  ctx.body = `${htmlPrefix}You need to have cookies enabled.<br /><a href="/playlists">Load playlists</a>${htmlSuffix}`
  await next()
}))

app.use(route.get('/authenticate', async (ctx, next) => {
  const authorizeURL = spotify.createAuthorizeURL(scopes, secret)
  ctx.redirect(authorizeURL)
  await next()
}))

app.use(route.get('/authenticated', async (ctx, next) => {
  const query = ctx.query
  if (ctx.query.state === secret) {
    const accessToken = (await spotify.authorizationCodeGrant(ctx.query.code)).body.access_token
    ctx.cookies.set('accessToken', accessToken)
    ctx.redirect('/playlists')
  } else {
    ctx.body = 'Failed: State inconsistent'
  }
  await next()
}))

app.use(route.get('/playlists', async (ctx, next) => {
  if (ctx.cookies.get('accessToken')) {
    spotify.setAccessToken(ctx.cookies.get('accessToken'))
    let playlists = []
    let playlistsRemaining = Infinity
    let offset = 0
    while (offset < playlistsRemaining) {
      const response = (await spotify.getUserPlaylists(null, {
        offset: offset,
        limit: MAX_PLAYLISTS_PER_QUERY
      })).body
      if (playlistsRemaining === Infinity) {
        playlistsRemaining = response.total
      }
      playlists = playlists.concat(response.items)
      offset += MAX_PLAYLISTS_PER_QUERY
    }
    ctx.body = `${htmlPrefix}<ol>\n${playlists.map(p => `<li><a href=/tracks?user=${p.owner.id}&playlist=${p.id}>${p.name}</a></li>`).join('\n')}</ol>${htmlSuffix}`
  } else {
    ctx.redirect('authenticated')
  }
  await next()
}))

app.use(route.get('/tracks', async (ctx, next) => {
  if (ctx.cookies.get('accessToken')) {
    spotify.setAccessToken(ctx.cookies.get('accessToken'))
    const userId = ctx.query.user;
    const playlistId = ctx.query.playlist;
    if (userId && playlistId) {
      let tracks = []
      let tracksRemaining = Infinity
      let offset = 0
      while (offset < tracksRemaining) {
        const response = (await spotify.getPlaylistTracks(userId, playlistId, {
          offset: offset,
          limit: MAX_TRACKS_PER_QUERY
        })).body
        if (tracksRemaining === Infinity) {
          tracksRemaining = response.total
        }
        tracks = tracks.concat(response.items.map(t => t.track))
        offset += MAX_TRACKS_PER_QUERY
      }
      ctx.body = `${htmlPrefix}<ol>\n${tracks.map(t => `<li>${t.name}</li>`).join('\n')}</ol>${htmlSuffix}`
    } else {
      ctx.redirect('Failed: No playlist specified')
    }
  } else {
    ctx.redirect('authenticated')
  }
  await next()
}))

app.listen(8000)
