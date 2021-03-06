const request = require('request-promise');

const sleep =  seconds => new Promise(resolve => setTimeout(resolve, seconds * 1000));

class NotFoundError extends Error {
	constructor() {
		super('Not found');
	}
}
class QuotaExceededError extends Error {
	constructor() {
		super('Quota exceeeded');
	}
}

// expensive method, it uses a lot of quota
async function getChannelVideos_expensive(channelId) {
	const params = {
		key: 'AIzaSyCZUzsEt22XubrBqE5-iQ7nGPoudRSBWEM',
		part: 'snippet',
		channelId,
		maxResults: 50,
		type: 'video'
	};

	const videos = [];
	let res = null;
	do {
		res = await get('https://www.googleapis.com/youtube/v3/search', params);
		for(let item of res['items'])
			videos.push(item);
		params['pageToken'] = res['nextPageToken'];
	} while(params['pageToken']);

	return videos;
}

async function retrieveChannelData(url) {
	const data = {videos: []};
	if(url.startsWith('channel'))
		data.channelId = url.replace('channel/', '');
	else if(url.startsWith('user'))
		data.username = url.replace('user/', '');
	else
		throw new Error(`Cannot get channel id or username from "${url}".`)

	const params = {
		key: 'AIzaSyCZUzsEt22XubrBqE5-iQ7nGPoudRSBWEM',
		part: 'contentDetails,statistics',
		id: data.channelId,
		forUsername: data.username
	};
	//console.log('Getting playlist id...');
	res = await get('https://www.googleapis.com/youtube/v3/channels', params);

	data['url'] = 'https://www.youtube.com/channel/' + res['items'][0]['id'];
	data['videoCount'] = parseInt(res['items'][0]['statistics']['videoCount']);
	data['viewCount'] = parseInt(res['items'][0]['statistics']['viewCount']);
	data['subscriberCount'] = parseInt(res['items'][0]['statistics']['subscriberCount']);

	const videos = await getChannelVideos(res['items'][0]['contentDetails']['relatedPlaylists']['uploads']);
	for(let video of videos) {
		data.videos.push({
			url: 'https://www.youtube.com/watch?v=' + video.id,
			publicationDate: video.snippet.publishedAt,
			viewCount: parseInt(video.statistics.viewCount),
			likeCount: parseInt(video.statistics.likeCount),
			dislikeCount: parseInt(video.statistics.dislikeCount),
			favoriteCount: parseInt(video.statistics.favoriteCount),
			commentCount: parseInt(video.statistics.commentCount),
			engagement: Number(((video.statistics.likeCount + video.statistics.commentCount) / video.statistics.viewCount).toFixed(3))
		});
	}

	return data;
}

async function getChannelVideos(uploadId) {
	let res, params, videoIds = [], videos = [];
	
	// get video ids
	params = {
		key: 'AIzaSyCZUzsEt22XubrBqE5-iQ7nGPoudRSBWEM',
		part: 'contentDetails',
		playlistId: uploadId,
		maxResults: 50
	};
	do {
		//console.log('Getting video ids...');
		res = await get('https://www.googleapis.com/youtube/v3/playlistItems', params);
		for(let item of res['items'])
			videoIds.push(item['contentDetails']['videoId']);
		params['pageToken'] = res['nextPageToken'];
	} while(params['pageToken']);

	// get statistics for every video
	params = {
		key: 'AIzaSyCZUzsEt22XubrBqE5-iQ7nGPoudRSBWEM',
		part: 'statistics,snippet'
	};
	for(let i = 0; i < videoIds.length; i += 50) {
		params.id = videoIds.slice(i, i + 50).map(v => v).join(',');
		//console.log('Getting video statistics...');
		res = await get('https://www.googleapis.com/youtube/v3/videos', params);
		for(let item of res.items)
			videos.push(item);
	}

	return videos;
}

async function get(url, params) {
	let res;
	try {
		res = await request({
			method: 'GET',
			url,
			qs: params,
			gzip: true,
			json: true,
			timeout: 30000
		});
	} catch (e) {
		if(e.code == 'ESOCKETTIMEDOUT') {
			console.warn('Time out, trying again in 10 seconds...');
			await sleep(10);
			return get(url, params);
		}

		const statusCode = e.response.statusCode;
		if (statusCode == 429) {
			console.warn('Too many requests to Instagram.com, waiting for 10 seconds...');
			await sleep(10);
			return get(url, params);
		}
		if (statusCode == 502 || statusCode == 503) {
			console.warn('Bad gateway or service unavailable, waiting for 10 seconds...');
			await sleep(10);
			return get(url, params);
		}
		if (statusCode == 404) throw new NotFoundError();
		if (statusCode == 403 && e.response.body.error.errors[0].reason == 'quotaExceeded')
			throw new QuotaExceededError();

		throw e;
	}

	return res;
}

module.exports = {
	retrieveChannelData
};