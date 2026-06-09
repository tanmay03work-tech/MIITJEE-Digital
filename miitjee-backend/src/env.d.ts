declare namespace Cloudflare {
	interface Env {
		SUPABASE_URL: string;
		SUPABASE_SERVICE_KEY: string;
		R2_BUCKET: R2Bucket;
	}
}
