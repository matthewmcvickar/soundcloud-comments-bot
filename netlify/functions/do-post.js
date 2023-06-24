import { doPost } from '../../bot';

exports.handler = async function(event, context) {
  // console.log('---');
  // console.log('RUNNING SCHEDULED FUNCTION:');
  // console.log('Received event:', event);
  // console.log('In context:', context);

  // Do the post.
  console.log('CALLING doPost() FUNCTION:')
  const result = await doPost();

  return {
    headers: {},
    body: result,
    statusCode: 200,
  };
}
