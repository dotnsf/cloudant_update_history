// app.js

var cfenv = require( 'cfenv' );
var express = require( 'express' );
var bodyParser = require( 'body-parser' );
var app = express();

var settings = require( './settings' );
var appEnv = cfenv.getAppEnv();

//. https://www.npmjs.com/package/@cloudant/cloudant
var Cloudantlib = require( '@cloudant/cloudant' );
var cloudant = null;
var db = null;

if( settings.db_username && settings.db_password ){
  cloudant = Cloudantlib( { account: settings.db_username, password: settings.db_password } );
}

if( cloudant ){
  cloudant.db.get( settings.db_name, function( err, body ){
    if( err ){
      if( err.statusCode == 404 ){
        cloudant.db.create( settings.db_name, function( err, body ){
          if( err ){
            db = null;
          }else{
            db = cloudant.db.use( settings.db_name );
          }
        });
      }else{
        db = cloudant.db.use( settings.db_name );
      }
    }else{
      db = cloudant.db.use( settings.db_name );
    }
  });
}

app.use( express.static( __dirname + '/public' ) );
app.use( bodyParser.urlencoded( { extended: true, limit: '10mb' } ) );
app.use( bodyParser.json() );


app.post( '/doc', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'POST /doc' );
  //console.log( req.body );
  if( db ){
    if( req.body._id ){
      //. 更新
      db.get( req.body._id, { include_docs: true }, function( err, body ){
        if( err ){
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
          res.end();
        }else{
          var doc = body;
          var text = req.body.text;
          if( text ){
            doc.text = text;
          }
          doc.updated = ( new Date() ).getTime();

          db.insert( doc, function( err, body ){
            if( err ){
              res.status( 400 );
              res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
              res.end();
            }else{
              res.write( JSON.stringify( { status: true, doc: body, message: 'document is updated.' }, 2, null ) );
              res.end();
            }
          });
        }
      });
    }else{
      //. 作成
      var doc = req.body;
      doc.created = doc.updated = ( new Date() ).getTime();

      db.insert( doc, function( err, body ){
        if( err ){
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
          res.end();
        }else{
          res.write( JSON.stringify( { status: true, doc: body, message: 'document is created.' }, 2, null ) );
          res.end();
        }
      });
    }
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});

app.get( '/docs', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'GET /docs' );

  db.list( { include_docs: true }, function( err, body ){
    if( err ){
      res.status( 400 );
      res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
      res.end();
    }else{
      var docs = [];
      body.rows.forEach( function( doc ){
        docs.push( doc.doc );
      });

      var result = { status: true, docs: docs };
      res.write( JSON.stringify( result, 2, null ) );
      res.end();
    }
  });
});

app.get( '/doc/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  console.log( 'GET /doc/' + id );
  if( db ){
    var option = { include_docs: true };
    var rev = req.query.rev;
    if( rev ){
      option['rev'] = rev;
    }
    db.get( id, option, function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        res.write( JSON.stringify( { status: true, doc: body }, 2, null ) );
        res.end();
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});

app.delete( '/doc/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  var user_id = req.body.user_id;
  console.log( 'DELETE /doc/' + id );
  if( db ){
    db.get( id, function( err, data ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        //console.log( data );
        db.destroy( id, data._rev, function( err, body ){
          if( err ){
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
            res.end();
          }else{
            res.write( JSON.stringify( { status: true }, 2, null ) );
            res.end();
          }
        });
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});

app.get( '/doc/:id/history', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  console.log( 'GET /doc/' + id + '/history' );
  if( db ){
    db.get( id, { include_docs: true, revs_info: true }, function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        res.write( JSON.stringify( { status: true, doc: body }, 2, null ) );
        res.end();
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});


function sortDocuments( _docs, key ){
  var docs = [];
  if( !key ){ key = 'created'; }
  for( var i = 0; i < _docs.length; i ++ ){
    var _doc = _docs[i];
    if( key in _doc ){
      var b = false;
      for( var j = 0; j < docs.length && !b; j ++ ){
        if( docs[j][key] > _doc[key] ){
          docs.splice( j, 0, _doc );
          b = true;
        }
      }
      if( !b ){
        docs.push( _doc );
      }
    }
  }

  return docs;
}


var port = settings.app_port || appEnv.port || 3000;
app.listen( port );
console.log( 'server started on ' + port );
