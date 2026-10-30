# RSSHub for The Daily Index, as a Hugging Face Docker Space (see README.md).
FROM diygod/rsshub:latest
# Hugging Face sends traffic to the port named in README.md (app_port).
ENV PORT=7860
# Every route read is kept 10 minutes here too, so X sees one read per
# account per 10 minutes however often the site asks.
ENV CACHE_TYPE=memory
ENV CACHE_EXPIRE=600
ENV CACHE_CONTENT_EXPIRE=3600
EXPOSE 7860
