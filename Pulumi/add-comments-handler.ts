import * as azure from 'azure-storage';
import { HttpRequest } from "@azure/functions";

declare var process;

export const AddCommentsHandler = (context: any, request: HttpRequest): Promise<{status: number, body: string}> => 
    new Promise(async (resolve, reject) => {
        const connectionstring = isStaging(request) ? process.env.CUSTOMCONNSTR_STAGING : process.env.CUSTOMCONNSTR_PRODUCTION;
        const tableService = azure.createTableService(connectionstring);
        tableService.createTableIfNotExists('comments', (error, result, response) => {
            if (error) {
                resolve({ status: 500, body: "Could not create table - " + error  });
                return;
            }

            var rowKey = new Date().toString();
            var entGen = azure.TableUtilities.entityGenerator;
            var entity = {
                PartitionKey: entGen.String(request.body.postId),
                RowKey: entGen.String(rowKey),
                Body: entGen.String(request.body.body),
                Commenter: entGen.String(request.body.commenter)
            };
            tableService.insertEntity('comments', entity, function(error, result, response) {
                if (error) {
                    resolve({ status: 500, body: "Could not create comment - " + error  });
                    return;
                }
            
                resolve({ status: 200, body: JSON.stringify({ body: request.body.body, commenter: request.body.commenter, timestamp: rowKey })  }); 
                return;
            });
        });
    });

function isStaging(request: HttpRequest) {
    if (request.headers["Referer"]) {
        return request.headers["Referer"].indexOf("staging") >= 0;
    }
    return true;
}