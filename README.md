its designed to run on heroku

needs lnd, obviously. and twillio account

on heroku, you need to provision mysql from jawsdb. this one I belive: https://devcenter.heroku.com/articles/jawsdb
but only version 8+, as it needs `json` data type

all configuration params must be supplied as env variables, or filled in `.env.example`
