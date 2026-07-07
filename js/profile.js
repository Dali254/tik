/* profile.js — TikTok profile lookup for followers app */

function ttFormatCount(n) {
  if (n == null || isNaN(n)) return '–';
  if (n >= 1e9) return (n/1e9).toFixed(1).replace(/\.0$/,'') + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'') + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'') + 'K';
  return String(n);
}

function ttAvatarUrl(username) {
  var clean = username.replace(/^@/,'').trim();
  return 'https://unavatar.io/tiktok/' + encodeURIComponent(clean) +
    '?fallback=https://ui-avatars.com/api/?name=' +
    encodeURIComponent(clean) + '%26background=fe2c55%26color=fff%26bold=true%26size=200';
}

function ttFetchRealProfile(username) {
  var clean = username.replace(/^@/,'').trim();
  var displayName = clean.charAt(0).toUpperCase() + clean.slice(1).replace(/[._]/g,' ');
  var unknown = {
    username: clean, name: displayName,
    avatar: ttAvatarUrl(clean),
    followers: null, following: null, likes: null,
    verified: false, bio: '', real: false
  };
  return fetch('https://www.tikwm.com/api/user/info?unique_id=' + encodeURIComponent(clean),
    { headers: { 'Accept': 'application/json' } })
    .then(function(r) { if(!r.ok) throw new Error('bad'); return r.json(); })
    .then(function(data) {
      if (!data) throw new Error('no data');
      var d = data.data || data;
      var container = d.userInfo || d;
      var u = container.user || d.user || {};
      var s = container.stats || d.stats || {};
      var pick = function() {
        for (var i=0;i<arguments.length;i++) {
          var v=arguments[i];
          if (typeof v==='number' && !isNaN(v)) return v;
          if (typeof v==='string' && v!=='' && !isNaN(+v)) return +v;
        }
        return null;
      };
      var followers = pick(s.followerCount, s.followers, s.fans);
      var following = pick(s.followingCount, s.following);
      var likes     = pick(s.heartCount, s.heart, s.diggCount);
      if (followers===null && !u.nickname) throw new Error('empty');
      return {
        username: clean, name: u.nickname || displayName,
        avatar: u.avatarLarger || u.avatarMedium || u.avatarThumb || ttAvatarUrl(clean),
        followers: followers, following: following, likes: likes,
        verified: !!u.verified, bio: u.signature || '', real: true
      };
    })
    .catch(function() { return unknown; });
}
