import { HttpRequest } from "@azure/functions";
import * as azure from 'azure-storage';

declare var process;

export const GetCommentsHandler = (context: any, request: HttpRequest): Promise<{status: number, body: string}> => 
    new Promise(async (resolve, reject) => {
        const connectionstring = isStaging(request) ? process.env.CUSTOMCONNSTR_STAGING : process.env.CUSTOMCONNSTR_PRODUCTION;;
        const tableService = azure.createTableService(connectionstring);
        tableService.doesTableExist("comments", (error, result, response) => {
            if (!result || !result.exists) {
                resolve({ status: 200, body: JSON.stringify([]) });
                return;
            }

        getCommentsRecursively(tableService,  request.params["postId"], [], <any>undefined).then(comments => {;
                resolve({ status: 200, body: JSON.stringify(comments.map(x => ({ body: x.Body._, commenter: x.Commenter._, timestamp: x.Timestamp._ }))) });
            }, error => {
                resolve({ status: 500, body: "Failed to retrieve comments" });
            })
        })
});

function isStaging(request: HttpRequest) {
    if (request.headers["Referer"]) {
        return request.headers["Referer"].indexOf("staging") >= 0;
    }
    return true;
}

async function getCommentsRecursively(tableService: azure.TableService, postId: string, entries: any[], token: azure.TableService.TableContinuationToken): Promise<any[]> {
    return new Promise(async (resolve, reject) => {
        var query = new azure.TableQuery().where('PartitionKey eq ?', postId);
        tableService.queryEntities<any>("comments", query, <any>null, (error, result, response) => {
            if (error) {
                throw error;
            }
            entries.push(...result.entries);
            if (result.continuationToken) {
                getCommentsRecursively(tableService, postId, entries, result.continuationToken).then(x => {
                    entries.push(...result.entries);
                    resolve(entries);
                })
            } else {
                resolve(entries);
            }
        })
    })
}
