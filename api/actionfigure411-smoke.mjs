import actionFigure411Handler from './actionfigure411-zenrows.mjs';

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;
    return res.end('GET only');
  }

  // Simula lo que puede ocurrir en móvil: la IA deja un título demasiado corto,
  // pero conserva las pistas impresas del embalaje en tags/explicación.
  const fakeReq={
    method:'POST',
    body:{
      item:{
        type:'figure',
        title:'Iron Man',
        character:'Iron Man',
        manufacturer:'Hasbro',
        line:'Marvel Legends',
        franchise:'Marvel',
        edition:'',
        wave:'',
        exclusive:'',
        year:null,
        sku:'F0192',
        barcode:'',
        tags:['Thanos','Infinity Saga'],
        aiExplanation:'En el frontal se lee Iron Man Mark LXXXV junto a Thanos, de The Infinity Saga.'
      }
    }
  };

  return actionFigure411Handler(fakeReq,res);
}
